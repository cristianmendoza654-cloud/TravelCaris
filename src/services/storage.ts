import { v4 as uuid } from 'uuid';
import {
  initialAccommodations,
  initialActivities,
  initialFlights,
  initialPackingItems,
  initialReminders,
  initialSearchProviders,
  initialSettings,
  initialTransports,
  initialTrips,
  starterTripId,
} from '../domain/initialData';
import { completeActivity, richActivityDefaults } from '../domain/activity';
import type {
  Accommodation,
  Activity,
  AppSettings,
  BackupData,
  Expense,
  Flight,
  FlightAlert,
  FlightDataSource,
  FlightStatusResult,
  PackingItem,
  Reminder,
  SavedPlace,
  SearchHistoryEntry,
  SearchProvider,
  StoredImage,
  Transport,
  TravelDocument,
  Trip,
  TripDay,
} from '../domain/types';
import { db } from './db';
import { detectFlightChanges, flightNumberVariants, normalizeFlightNumber } from './flightStatus';
import { isSafeExternalUrl } from './links';
import { validatePdfImportDraft, type PdfImportDraft } from './pdfImport';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export async function ensureInitialData() {
  const settings = await db.settings.get('settings');
  if (settings?.initialized && (await db.trips.count()) > 0) {
    if ((await db.searchProviders.count()) === 0) await db.searchProviders.bulkPut(clone(initialSearchProviders));
    const trips = await db.trips.toArray();
    const missingBudget = trips.filter((trip) => !Number.isFinite(trip.budget));
    if (missingBudget.length) await db.trips.bulkPut(missingBudget.map((trip) => ({ ...trip, budget: settings.budgetGbp ?? 0 })));
    return;
  }
  await restoreInitialData();
}

export async function restoreInitialData() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
    await db.trips.bulkPut(clone(initialTrips));
    await db.activities.bulkPut(clone(initialActivities));
    await db.accommodations.bulkPut(clone(initialAccommodations));
    await db.transports.bulkPut(clone(initialTransports));
    await db.packingItems.bulkPut(clone(initialPackingItems));
    await db.reminders.bulkPut(clone(initialReminders));
    await db.flights.bulkPut(clone(initialFlights));
    await db.searchProviders.bulkPut(clone(initialSearchProviders));
    await db.settings.put(clone(initialSettings));
  });
}

export async function getSnapshot() {
  await ensureInitialData();
  const settings = (await db.settings.get('settings')) ?? initialSettings;
  const storedTrips = await db.trips.orderBy('startDate').toArray();
  const trips = storedTrips.map((trip) => ({
    ...trip,
    budget: Number.isFinite(trip.budget) ? trip.budget : settings.budgetGbp ?? 0,
  }));
  const activeTripId = trips.some((trip) => trip.id === settings.activeTripId)
    ? settings.activeTripId
    : trips[0]?.id ?? starterTripId;
  const [
    activities,
    accommodations,
    transports,
    documents,
    expenses,
    packingItems,
    reminders,
    flights,
    flightStatusHistory,
    flightAlerts,
    searchProviders,
    searchHistory,
    savedPlaces,
  ] = await Promise.all([
    db.activities.where('tripId').equals(activeTripId).toArray(),
    db.accommodations.where('tripId').equals(activeTripId).toArray(),
    db.transports.where('tripId').equals(activeTripId).toArray(),
    db.documents.where('tripId').equals(activeTripId).toArray(),
    db.expenses.where('tripId').equals(activeTripId).toArray(),
    db.packingItems.where('tripId').equals(activeTripId).toArray(),
    db.reminders.where('tripId').equals(activeTripId).toArray(),
    db.flights.where('tripId').equals(activeTripId).sortBy('scheduledDate'),
    db.flightStatusHistory.toArray(),
    db.flightAlerts.where('tripId').equals(activeTripId).reverse().sortBy('createdAt'),
    db.searchProviders.orderBy('order').toArray(),
    db.searchHistory.where('tripId').equals(activeTripId).reverse().sortBy('createdAt'),
    db.savedPlaces.where('tripId').equals(activeTripId).reverse().sortBy('createdAt'),
  ]);
  const flightIds = new Set(flights.map((flight) => flight.id));

  return {
    trips,
    activeTrip: trips.find((trip) => trip.id === activeTripId) ?? initialTrips[0],
    activities: activities.map(completeActivity).sort(sortActivities),
    accommodations,
    transports,
    documents,
    expenses,
    packingItems: packingItems.sort((a, b) => a.order - b.order),
    reminders,
    flights,
    flightStatusHistory: flightStatusHistory
      .filter((entry) => flightIds.has(entry.flightId))
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)),
    flightAlerts,
    searchProviders,
    searchHistory: searchHistory.slice(0, 30),
    savedPlaces,
    settings: { ...initialSettings, ...settings, activeTripId },
  };
}

export type AppSnapshot = Awaited<ReturnType<typeof getSnapshot>>;

export const sortActivities = (a: Activity, b: Activity) =>
  a.day.localeCompare(b.day) || a.order - b.order || a.startTime.localeCompare(b.startTime);

async function activeTripId() {
  await ensureInitialData();
  return (await db.settings.get('settings'))?.activeTripId ?? starterTripId;
}

export async function saveActivity(activity: Activity) {
  await ensureInitialData();
  await db.activities.put(completeActivity({ ...activity, date: activity.day, updatedAt: new Date().toISOString() }));
}

export async function addActivityImageIfMissing(id: string, image: StoredImage) {
  await ensureInitialData();
  return db.transaction('rw', db.activities, async () => {
    const activity = await db.activities.get(id);
    if (!activity || activity.mainImage) return false;
    await db.activities.put(completeActivity({
      ...activity,
      mainImage: image.dataUrl,
      gallery: [...activity.gallery, image],
      updatedAt: new Date().toISOString(),
    }));
    return true;
  });
}

export async function createActivity(input: Partial<Activity> & Pick<Activity, 'title' | 'day'>) {
  const tripId = input.tripId ?? (await activeTripId());
  const existing = await db.activities.where('tripId').equals(tripId).and((item) => item.day === input.day).toArray();
  const date = new Date().toISOString();
  const activity: Activity = {
    ...richActivityDefaults(),
    id: uuid(),
    tripId,
    title: input.title,
    description: input.description ?? '',
    date: input.day,
    startTime: input.startTime ?? '10:00',
    endTime: input.endTime ?? '',
    estimatedDurationMinutes: input.estimatedDurationMinutes ?? 60,
    category: input.category ?? 'Otros',
    address: input.address ?? '',
    lat: input.lat,
    lng: input.lng,
    mainImage: input.mainImage,
    gallery: input.gallery ?? [],
    adultPrice: input.adultPrice ?? 0,
    childPrice: input.childPrice ?? 0,
    estimatedTotalPrice: input.estimatedTotalPrice ?? 0,
    currency: input.currency ?? 'GBP',
    reservationRequired: input.reservationRequired ?? false,
    reservationDone: input.reservationDone ?? false,
    reservationReference: input.reservationReference ?? '',
    reservationLink: input.reservationLink ?? '',
    officialLink: input.officialLink ?? '',
    phone: input.phone ?? '',
    notes: input.notes ?? '',
    status: input.status ?? 'Pendiente',
    priority: input.priority ?? 'Media',
    tags: input.tags ?? [],
    day: input.day,
    order: existing.length + 1,
    visited: input.visited ?? false,
    favorite: input.favorite ?? false,
    planType: input.planType ?? (input.status === 'Alternativa' ? 'Alternativa' : 'Principal'),
    openingHours: input.openingHours ?? richActivityDefaults().openingHours,
    specialHours: input.specialHours ?? '',
    openingHoursNote: input.openingHoursNote ?? '',
    priceDetails: {
      ...richActivityDefaults().priceDetails,
      currency: input.currency ?? 'GBP',
      adult: input.adultPrice ?? 0,
      child: input.childPrice ?? 0,
      totalEstimate: input.estimatedTotalPrice ?? 0,
      ...(input.priceDetails ?? {}),
    },
    reservationStatus:
      input.reservationStatus ??
      (input.reservationDone ? 'Reservada' : input.reservationRequired ? 'Necesaria' : 'No necesaria'),
    bookingDeadline: input.bookingDeadline ?? '',
    cancellationPolicy: input.cancellationPolicy ?? '',
    meetingPoint: input.meetingPoint ?? '',
    accessibility: input.accessibility ?? '',
    strollerFriendly: input.strollerFriendly ?? false,
    familyFriendly: input.familyFriendly ?? true,
    minimumAge: input.minimumAge ?? '',
    rainPlan: input.rainPlan ?? '',
    environment: input.environment ?? 'Sin indicar',
    documents: input.documents ?? [],
    sourceName: input.sourceName ?? '',
    sourceUrl: input.sourceUrl ?? '',
    verificationStatus: input.verificationStatus ?? 'Pendiente de verificar',
    lastVerifiedAt: input.lastVerifiedAt ?? '',
    verificationNote: input.verificationNote ?? '',
    tourProvider: input.tourProvider ?? '',
    tourLanguage: input.tourLanguage ?? '',
    tourType: input.tourType ?? '',
    tipGuidance: input.tipGuidance ?? '',
    restaurantCuisine: input.restaurantCuisine ?? '',
    mealType: input.mealType ?? '',
    dietaryOptions: input.dietaryOptions ?? '',
    bookingPlatform: input.bookingPlatform ?? '',
    leisureType: input.leisureType ?? '',
    showTime: input.showTime ?? '',
    venue: input.venue ?? '',
    createdAt: date,
    updatedAt: date,
  };
  await db.activities.add(activity);
  return activity;
}

export async function duplicateActivity(activity: Activity) {
  return createActivity({ ...activity, id: undefined, title: `${activity.title} copia` });
}

export async function deleteActivity(id: string) {
  await ensureInitialData();
  await db.activities.delete(id);
}

export async function reorderActivities(day: TripDay, orderedIds: string[]) {
  await ensureInitialData();
  const tripId = await activeTripId();
  const activities = await db.activities.where('tripId').equals(tripId).and((item) => item.day === day).toArray();
  await db.activities.bulkPut(
    activities.map((activity) => ({
      ...activity,
      order: orderedIds.indexOf(activity.id) + 1 || activity.order,
      updatedAt: new Date().toISOString(),
    })),
  );
}

export async function moveActivity(id: string, day: TripDay) {
  await ensureInitialData();
  const activity = await db.activities.get(id);
  if (!activity) return;
  const target = await db.activities.where('tripId').equals(activity.tripId).and((item) => item.day === day).toArray();
  await saveActivity({ ...activity, day, date: day, order: target.length + 1 });
}

export async function putAccommodation(accommodation: Accommodation) {
  await ensureInitialData();
  await db.accommodations.put({ ...accommodation, updatedAt: new Date().toISOString() });
}

export async function addAccommodationImageIfMissing(id: string, image: StoredImage) {
  await ensureInitialData();
  return db.transaction('rw', db.accommodations, async () => {
    const accommodation = await db.accommodations.get(id);
    if (!accommodation || accommodation.images.length) return false;
    await db.accommodations.put({ ...accommodation, images: [image], updatedAt: new Date().toISOString() });
    return true;
  });
}

export async function deleteAccommodation(id: string) {
  await ensureInitialData();
  await db.accommodations.delete(id);
}

export async function putTransport(transport: Transport) {
  await ensureInitialData();
  await db.transports.put(transport);
}

export async function putDocument(document: TravelDocument) {
  await ensureInitialData();
  await db.documents.put({ ...document, tripId: document.tripId || (await activeTripId()) });
}

export async function deleteDocument(id: string) {
  await ensureInitialData();
  await db.documents.delete(id);
}

export async function putExpense(expense: Expense) {
  await ensureInitialData();
  await db.expenses.put({ ...expense, tripId: expense.tripId || (await activeTripId()) });
}

export async function deleteExpense(id: string) {
  await ensureInitialData();
  await db.expenses.delete(id);
}

export async function putPackingItem(item: PackingItem) {
  await ensureInitialData();
  await db.packingItems.put({ ...item, tripId: item.tripId || (await activeTripId()) });
}

export async function deletePackingItem(id: string) {
  await ensureInitialData();
  await db.packingItems.delete(id);
}

export async function putReminder(reminder: Reminder) {
  await ensureInitialData();
  await db.reminders.put({ ...reminder, tripId: reminder.tripId || (await activeTripId()) });
}

export async function deleteReminder(id: string) {
  await ensureInitialData();
  await db.reminders.delete(id);
}

export async function putSettings(settings: AppSettings) {
  await ensureInitialData();
  await db.settings.put(settings);
}

export async function saveSearchProvider(provider: SearchProvider) {
  await ensureInitialData();
  await db.searchProviders.put({ ...provider, updatedAt: new Date().toISOString() });
}

export async function recordSearch(entry: Omit<SearchHistoryEntry, 'id' | 'tripId' | 'createdAt'>) {
  await ensureInitialData();
  const history: SearchHistoryEntry = {
    ...entry,
    id: uuid(),
    tripId: await activeTripId(),
    createdAt: new Date().toISOString(),
  };
  await db.searchHistory.add(history);
  const entries = await db.searchHistory.where('tripId').equals(history.tripId).reverse().sortBy('createdAt');
  if (entries.length > 30) await db.searchHistory.bulkDelete(entries.slice(30).map((item) => item.id));
  return history;
}

export async function clearSearchHistory() {
  await ensureInitialData();
  const tripId = await activeTripId();
  await db.searchHistory.where('tripId').equals(tripId).delete();
}

export async function savePlace(input: Omit<SavedPlace, 'id' | 'tripId' | 'createdAt' | 'updatedAt'>) {
  await ensureInitialData();
  const now = new Date().toISOString();
  const place: SavedPlace = {
    ...input,
    id: uuid(),
    tripId: await activeTripId(),
    createdAt: now,
    updatedAt: now,
  };
  await db.savedPlaces.add(place);
  return place;
}

export async function deleteSavedPlace(id: string) {
  await ensureInitialData();
  await db.savedPlaces.delete(id);
}

export async function saveTrip(trip: Trip) {
  await ensureInitialData();
  await db.trips.put({ ...trip, updatedAt: new Date().toISOString() });
}

export async function createTrip(input: Pick<Trip, 'name' | 'destination' | 'country' | 'startDate' | 'endDate'> & Partial<Pick<Trip, 'currency' | 'secondaryCurrency' | 'description' | 'travellers' | 'budget' | 'coverImage' | 'coverImageAttribution' | 'coverImageSourceUrl'>>) {
  await ensureInitialData();
  const now = new Date().toISOString();
  const trip: Trip = {
    ...input,
    id: uuid(),
    coverImage: input.coverImage ?? '',
    coverImageAttribution: input.coverImageAttribution,
    coverImageSourceUrl: input.coverImageSourceUrl,
    description: input.description ?? '',
    currency: input.currency ?? 'EUR',
    secondaryCurrency: input.secondaryCurrency ?? 'EUR',
    exchangeRate: 1,
    budget: input.budget ?? 0,
    travellers: input.travellers ?? [],
    readinessOverrides: [],
    status: 'Próximo',
    createdAt: now,
    updatedAt: now,
  };
  await db.trips.add(trip);
  return trip;
}

export async function selectTrip(tripId: string) {
  const settings = (await db.settings.get('settings')) ?? initialSettings;
  await db.settings.put({ ...settings, activeTripId: tripId });
}

export async function deleteTrip(tripId: string) {
  await ensureInitialData();
  const settings = (await db.settings.get('settings')) ?? initialSettings;
  const flights = await db.flights.where('tripId').equals(tripId).toArray();

  await db.transaction('rw', db.tables, async () => {
    await Promise.all([
      db.activities.where('tripId').equals(tripId).delete(),
      db.accommodations.where('tripId').equals(tripId).delete(),
      db.transports.where('tripId').equals(tripId).delete(),
      db.documents.where('tripId').equals(tripId).delete(),
      db.expenses.where('tripId').equals(tripId).delete(),
      db.packingItems.where('tripId').equals(tripId).delete(),
      db.reminders.where('tripId').equals(tripId).delete(),
      db.flights.where('tripId').equals(tripId).delete(),
      db.flightAlerts.where('tripId').equals(tripId).delete(),
      db.searchHistory.where('tripId').equals(tripId).delete(),
      db.savedPlaces.where('tripId').equals(tripId).delete(),
    ]);
    if (flights.length) {
      await db.flightStatusHistory.where('flightId').anyOf(flights.map((flight) => flight.id)).delete();
    }
    await db.trips.delete(tripId);

    let remaining = await db.trips.orderBy('startDate').first();
    if (!remaining) {
      remaining = { ...clone(initialTrips[0]), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await db.trips.put(remaining);
    }
    const activeTripStillExists = await db.trips.get(settings.activeTripId);
    await db.settings.put({
      ...settings,
      activeTripId: settings.activeTripId === tripId || !activeTripStillExists ? remaining.id : settings.activeTripId,
      initialized: true,
    });
  });
}

export async function applyPdfImport(data: PdfImportDraft, mode: 'replace' | 'new') {
  const validationErrors = validatePdfImportDraft(data);
  if (validationErrors.length) throw new Error(validationErrors[0]);
  await ensureInitialData();
  const currentId = await activeTripId();
  const currentTrip = await db.trips.get(currentId);
  const detectedCurrency = mostCommonImportedCurrency(data);
  const destinationCurrency = data.sourceFormat === 'general'
    ? detectedCurrency ?? currentTrip?.currency ?? 'EUR'
    : data.trip.currency || detectedCurrency || currentTrip?.currency || 'EUR';
  const importedTrip = mode === 'new'
    ? await createTrip({ ...data.trip, currency: destinationCurrency, secondaryCurrency: data.trip.secondaryCurrency || 'EUR' })
    : {
        ...(currentTrip ?? initialTrips[0]),
        ...data.trip,
        currency: destinationCurrency,
        exchangeRate: destinationCurrency !== currentTrip?.currency ? 1 : currentTrip?.exchangeRate ?? 1,
        exchangeRateDate: destinationCurrency !== currentTrip?.currency ? undefined : currentTrip?.exchangeRateDate,
        exchangeRateUpdatedAt: destinationCurrency !== currentTrip?.currency ? undefined : currentTrip?.exchangeRateUpdatedAt,
        exchangeRateSource: destinationCurrency !== currentTrip?.currency ? undefined : currentTrip?.exchangeRateSource,
        id: currentId,
        updatedAt: new Date().toISOString(),
      };

  if (mode === 'replace') await saveTrip(importedTrip);
  const tripId = importedTrip.id;
  const oldFlights = await db.flights.where('tripId').equals(tripId).toArray();

  await db.transaction(
    'rw',
    [db.activities, db.accommodations, db.transports, db.flights, db.flightStatusHistory, db.flightAlerts],
    async () => {
      await Promise.all([
        db.activities.where('tripId').equals(tripId).delete(),
        db.accommodations.where('tripId').equals(tripId).delete(),
        db.transports.where('tripId').equals(tripId).delete(),
        db.flights.where('tripId').equals(tripId).delete(),
        db.flightAlerts.where('tripId').equals(tripId).delete(),
      ]);
      if (oldFlights.length) {
        await db.flightStatusHistory.where('flightId').anyOf(oldFlights.map((flight) => flight.id)).delete();
      }
    },
  );

  for (const activity of data.activities) await createActivity({ ...activity, tripId });
  const importedAt = new Date().toISOString();
  await db.accommodations.bulkPut(
    data.accommodations.map((accommodation) => ({
      ...accommodation,
      id: uuid(),
      tripId,
      createdAt: importedAt,
      updatedAt: importedAt,
    })),
  );
  for (const flight of data.flights) await createFlight({ ...flight, tripId });
  const [existingReminders, existingPacking] = await Promise.all([
    db.reminders.where('tripId').equals(tripId).toArray(),
    db.packingItems.where('tripId').equals(tripId).toArray(),
  ]);
  const reminderKeys = new Set(existingReminders.map((item) => `${item.date}|${item.time}|${item.title.toLocaleLowerCase('es')}`));
  const packingKeys = new Set(existingPacking.map((item) => `${item.list}|${item.person}|${item.title.toLocaleLowerCase('es')}`));
  await db.reminders.bulkPut(data.reminders
    .filter((item) => !reminderKeys.has(`${item.date}|${item.time}|${item.title.toLocaleLowerCase('es')}`))
    .map((item) => ({ ...item, id: uuid(), tripId })));
  await db.packingItems.bulkPut(data.packingItems
    .filter((item) => !packingKeys.has(`${item.list}|${item.person}|${item.title.toLocaleLowerCase('es')}`))
    .map((item, index) => ({ ...item, id: uuid(), tripId, order: existingPacking.length + index + 1 })));
  await selectTrip(tripId);
  return tripId;
}

function mostCommonImportedCurrency(data: PdfImportDraft) {
  const counts = data.activities.reduce<Record<string, number>>((result, activity) => {
    const price = activity.priceDetails;
    const hasPrice = price && price.kind !== 'Desconocido' && [price.adult, price.child, price.family, price.totalEstimate].some((value) => value > 0);
    if (hasPrice) result[price.currency] = (result[price.currency] ?? 0) + 1;
    return result;
  }, {});
  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0];
}

export async function saveFlight(flight: Flight) {
  await ensureInitialData();
  const normalizedFlightNumber = normalizeFlightNumber(flight.flightNumber);
  const updated: Flight = {
    ...flight,
    normalizedFlightNumber,
    lookupVariants: flightNumberVariants(flight.flightNumber),
    updatedAt: new Date().toISOString(),
  };
  const duplicate = await db.flights
    .where('tripId')
    .equals(updated.tripId)
    .and(
      (item) =>
        item.id !== updated.id &&
        item.scheduledDate === updated.scheduledDate &&
        item.normalizedFlightNumber === normalizedFlightNumber,
    )
    .first();
  if (duplicate) throw new Error('Ya existe este vuelo para la misma fecha.');
  await db.flights.put(updated);
  return updated;
}

export async function deleteFlight(id: string) {
  await ensureInitialData();
  await db.transaction('rw', [db.flights, db.flightStatusHistory, db.flightAlerts], async () => {
    await Promise.all([
      db.flightStatusHistory.where('flightId').equals(id).delete(),
      db.flightAlerts.where('flightId').equals(id).delete(),
      db.flights.delete(id),
    ]);
  });
}

export async function createFlight(input: Partial<Flight> & Pick<Flight, 'flightNumber' | 'scheduledDate'>) {
  const now = new Date().toISOString();
  const tripId = input.tripId ?? (await activeTripId());
  return saveFlight({
    id: uuid(),
    tripId,
    airline: input.airline ?? '',
    airlineIata: input.airlineIata ?? '',
    flightNumber: input.flightNumber,
    normalizedFlightNumber: normalizeFlightNumber(input.flightNumber),
    lookupVariants: flightNumberVariants(input.flightNumber),
    scheduledDate: input.scheduledDate,
    departureAirport: input.departureAirport ?? '',
    departureIata: input.departureIata ?? '',
    arrivalAirport: input.arrivalAirport ?? '',
    arrivalIata: input.arrivalIata ?? '',
    scheduledDepartureTime: input.scheduledDepartureTime ?? '',
    estimatedDepartureTime: '',
    actualDepartureTime: '',
    scheduledArrivalTime: input.scheduledArrivalTime ?? '',
    estimatedArrivalTime: '',
    actualArrivalTime: '',
    departureTerminal: input.departureTerminal ?? '',
    arrivalTerminal: input.arrivalTerminal ?? '',
    gate: '',
    checkInCounter: '',
    baggageBelt: '',
    status: input.status ?? 'Programado',
    delayMinutes: 0,
    aircraftType: '',
    aircraftRegistration: '',
    bookingReference: '',
    ticketNumber: '',
    includedBaggage: input.includedBaggage ?? '',
    notes: input.notes ?? '',
    officialTrackingUrl: input.officialTrackingUrl ?? '',
    departureAirportUrl: input.departureAirportUrl ?? '',
    arrivalAirportUrl: input.arrivalAirportUrl ?? '',
    lastStatusProvider: 'Manual',
    lastUpdatedAt: '',
    lastCheckedAt: '',
    lastUpdateError: '',
    autoUpdateEnabled: false,
    alertsEnabled: true,
    manualFields: {},
    automaticConflicts: {},
    createdAt: now,
    updatedAt: now,
  });
}

export async function saveManualFlightChanges(flightId: string, changes: Partial<Flight>, source = 'Usuario') {
  const flight = await db.flights.get(flightId);
  if (!flight) throw new Error('Vuelo no encontrado.');
  const detectedAt = new Date().toISOString();
  const changedEntries = Object.entries(changes).filter(
    ([field, value]) => field in flight && String(flight[field as keyof Flight] ?? '') !== String(value ?? ''),
  );
  const manualFields = { ...flight.manualFields };
  for (const [field] of changedEntries) manualFields[field] = detectedAt;
  await db.transaction('rw', [db.flights, db.flightStatusHistory], async () => {
    await db.flightStatusHistory.bulkAdd(
      changedEntries.map(([field, value]) => ({
        id: uuid(),
        flightId,
        detectedAt,
        field,
        previousValue: String(flight[field as keyof Flight] ?? ''),
        newValue: String(value ?? ''),
        source: source as FlightDataSource,
        important: ['status', 'delayMinutes', 'departureTerminal', 'arrivalTerminal', 'gate'].includes(field),
      })),
    );
    await db.flights.put({
      ...flight,
      ...changes,
      manualFields,
      automaticConflicts: { ...flight.automaticConflicts },
      lastStatusProvider: 'Usuario',
      lastUpdatedAt: detectedAt,
      updatedAt: detectedAt,
    });
  });
}

export async function applyFlightStatusResult(flightId: string, result: FlightStatusResult) {
  const flight = await db.flights.get(flightId);
  if (!flight) throw new Error('Vuelo no encontrado.');
  const changes = detectFlightChanges(flight, result);
  const updates: Partial<Flight> = {};
  const automaticConflicts = { ...flight.automaticConflicts };

  for (const item of changes) {
    if (flight.manualFields[String(item.field)]) {
      automaticConflicts[String(item.field)] = {
        value: item.newValue,
        source: result.provider,
        detectedAt: result.checkedAt,
      };
    } else {
      (updates as Record<string, unknown>)[item.field] = (result as unknown as Record<string, unknown>)[item.field];
    }
  }

  await db.transaction('rw', [db.flights, db.flightStatusHistory, db.flightAlerts], async () => {
    if (changes.length) {
      await db.flightStatusHistory.bulkAdd(
        changes.map((item) => ({
          id: uuid(),
          flightId,
          detectedAt: result.checkedAt,
          field: String(item.field),
          previousValue: item.previousValue,
          newValue: item.newValue,
          source: result.provider,
          important: item.important,
        })),
      );
      await db.flightAlerts.bulkAdd(
        changes.map((item) => ({
            id: uuid(),
            tripId: flight.tripId,
            flightId,
            createdAt: result.checkedAt,
            type: item.alertType,
            message: item.message,
            read: false,
            source: result.provider,
            recommendedAction: item.recommendedAction,
          })),
      );
    }
    await db.flights.put({
      ...flight,
      ...updates,
      automaticConflicts,
      lastStatusProvider: result.provider,
      lastCheckedAt: result.checkedAt,
      lastUpdatedAt: result.checkedAt,
      lastUpdateError: '',
      updatedAt: result.checkedAt,
    });
  });
  return changes;
}

export async function resolveFlightConflict(flightId: string, field: string, useAutomatic: boolean) {
  const flight = await db.flights.get(flightId);
  const conflict = flight?.automaticConflicts[field];
  if (!flight || !conflict) return;
  const automaticConflicts = { ...flight.automaticConflicts };
  delete automaticConflicts[field];
  const manualFields = { ...flight.manualFields };
  if (useAutomatic) delete manualFields[field];
  await saveFlight({
    ...flight,
    ...(useAutomatic ? { [field]: coerceFlightValue(field, conflict.value) } : {}),
    manualFields,
    automaticConflicts,
  });
}

function coerceFlightValue(field: string, value: string) {
  return field === 'delayMinutes' ? Number(value) : value;
}

export async function recordFlightError(flightId: string, message: string, source: FlightDataSource) {
  const flight = await db.flights.get(flightId);
  if (!flight) return;
  const now = new Date().toISOString();
  await db.transaction('rw', [db.flights, db.flightAlerts], async () => {
    await db.flights.put({ ...flight, lastCheckedAt: now, lastUpdateError: message, updatedAt: now });
    await db.flightAlerts.add({
      id: uuid(),
      tripId: flight.tripId,
      flightId,
      createdAt: now,
      type: 'Atención',
      message: 'No se ha podido comprobar el estado del vuelo',
      read: false,
      source,
      recommendedAction: 'Consulta la fuente oficial o registra el estado manualmente.',
    });
  });
}

export async function markAlertRead(alert: FlightAlert) {
  await db.flightAlerts.put({ ...alert, read: true });
}

export async function clearFlightStatusCache() {
  const flights = await db.flights.toArray();
  await db.flights.bulkPut(
    flights.map((flight) => ({
      ...flight,
      lastCheckedAt: '',
      lastUpdateError: '',
      automaticConflicts: {},
    })),
  );
}

export async function clearAllData() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
}

export async function exportBackup(): Promise<BackupData> {
  await ensureInitialData();
  const [
    trips,
    activities,
    accommodations,
    transports,
    documents,
    expenses,
    packingItems,
    reminders,
    flights,
    flightStatusHistory,
    flightAlerts,
    searchProviders,
    searchHistory,
    savedPlaces,
    settings,
  ] = await Promise.all([
    db.trips.toArray(),
    db.activities.toArray(),
    db.accommodations.toArray(),
    db.transports.toArray(),
    db.documents.toArray(),
    db.expenses.toArray(),
    db.packingItems.toArray(),
    db.reminders.toArray(),
    db.flights.toArray(),
    db.flightStatusHistory.toArray(),
    db.flightAlerts.toArray(),
    db.searchProviders.toArray(),
    db.searchHistory.toArray(),
    db.savedPlaces.toArray(),
    db.settings.get('settings'),
  ]);
  return {
    version: '3.9.0',
    exportedAt: new Date().toISOString(),
    trips,
    activities,
    accommodations,
    transports,
    documents,
    expenses,
    packingItems,
    reminders,
    flights,
    flightStatusHistory,
    flightAlerts,
    searchProviders,
    searchHistory,
    savedPlaces,
    settings: settings ?? initialSettings,
  };
}

export function validateBackup(data: unknown): data is BackupData {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Partial<BackupData> & Record<string, unknown>;
  const requiredArrays = [
    'trips',
    'activities',
    'accommodations',
    'transports',
    'documents',
    'expenses',
    'packingItems',
    'reminders',
    'flights',
    'flightStatusHistory',
    'flightAlerts',
  ];
  const optionalWebUrl = (value: unknown) => typeof value !== 'string' || !value || isSafeExternalUrl(value);
  const safeLinks =
    (candidate.activities ?? []).every((activity) => optionalWebUrl(activity.officialLink) && optionalWebUrl(activity.reservationLink) && optionalWebUrl(activity.sourceUrl)) &&
    (candidate.flights ?? []).every((flight) => optionalWebUrl(flight.officialTrackingUrl) && optionalWebUrl(flight.departureAirportUrl) && optionalWebUrl(flight.arrivalAirportUrl)) &&
    (candidate.searchProviders ?? []).every((provider) => isSafeExternalUrl(provider.urlTemplate.replace('{query}', 'consulta'))) &&
    (candidate.savedPlaces ?? []).every((place) => optionalWebUrl(place.sourceLink));
  return (
    requiredArrays.every((key) => Array.isArray(candidate[key])) &&
    Array.isArray(candidate.trips) &&
    candidate.trips.length > 0 &&
    candidate.trips.every((trip) => typeof trip?.id === 'string' && typeof trip?.name === 'string') &&
    !!candidate.settings &&
    typeof candidate.settings === 'object' &&
    candidate.settings.id === 'settings' &&
    safeLinks
  );
}

export async function importBackup(data: BackupData, mode: 'replace' | 'merge') {
  if (!validateBackup(data)) throw new Error('El archivo no tiene un formato de copia válido.');
  if (mode === 'replace') await clearAllData();
  await db.transaction('rw', db.tables, async () => {
    await db.trips.bulkPut(data.trips.map((item) => ({ ...item, id: item.id || uuid() })));
    await db.activities.bulkPut(data.activities.map((item) => ({ ...item, id: item.id || uuid() })));
    await db.accommodations.bulkPut(data.accommodations.map((item) => ({ ...item, id: item.id || uuid() })));
    await db.transports.bulkPut(data.transports.map((item) => ({ ...item, id: item.id || uuid() })));
    await db.documents.bulkPut(data.documents.map((item) => ({ ...item, id: item.id || uuid() })));
    await db.expenses.bulkPut(data.expenses.map((item) => ({ ...item, id: item.id || uuid() })));
    await db.packingItems.bulkPut(data.packingItems.map((item) => ({ ...item, id: item.id || uuid() })));
    await db.reminders.bulkPut(data.reminders.map((item) => ({ ...item, id: item.id || uuid() })));
    await db.flights.bulkPut(data.flights.map((item) => ({ ...item, id: item.id || uuid() })));
    await db.flightStatusHistory.bulkPut(data.flightStatusHistory);
    await db.flightAlerts.bulkPut(data.flightAlerts);
    await db.searchProviders.bulkPut(data.searchProviders ?? clone(initialSearchProviders));
    await db.searchHistory.bulkPut(data.searchHistory ?? []);
    await db.savedPlaces.bulkPut(data.savedPlaces ?? []);
    await db.settings.put({ ...data.settings, initialized: true });
  });
}
