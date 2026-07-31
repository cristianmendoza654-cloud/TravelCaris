import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BedDouble,
  BellRing,
  CalendarPlus,
  CalendarDays,
  BadgeCheck,
  Check,
  Clock3,
  ClipboardList,
  Download,
  Edit3,
  Euro,
  ExternalLink,
  FileText,
  GripVertical,
  Home,
  Hospital,
  Image as ImageIcon,
  Info,
  Landmark,
  LoaderCircle,
  LocateFixed,
  Luggage,
  Map as MapIcon,
  MapPin,
  MapPinned,
  MoreHorizontal,
  Navigation,
  Plane,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  ShoppingBag,
  Share2,
  Ticket,
  Trash2,
  Trees,
  Upload,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react';
import { divIcon } from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { v4 as uuid } from 'uuid';
import type {
  Accommodation,
  Activity,
  BackupData,
  Category,
  Expense,
  PackingItem,
  Reminder,
  StoredImage,
  Trip,
  TripDay,
} from '../domain/types';
import { categories, currencyCodes, statuses, weekdays } from '../domain/types';
import { emptyPriceDetails, emptyWeeklyOpeningHours, isActivityStale } from '../domain/activity';
import { convertTripCurrency, expenseTotals, formatMoney } from '../services/calculations';
import { exchangeRateIsFresh, fetchLatestExchangeRate } from '../services/exchangeRates';
import { fileToDataUrl, imageFileToStoredImage } from '../services/files';
import { findItineraryGaps } from '../services/planning';
import { travelReadiness } from '../services/readiness';
import { dueReminders, nextReminderDelay, reminderCalendarFile, reminderTimestamp } from '../services/reminders';
import { appleMapsSearch, googleMapsSearch, isSafeExternalUrl, shareText } from '../services/links';
import { mapMarkerLegend, mapMarkerStyle, type MapMarkerKind } from '../services/map';
import { findAndStorePlaceImage } from '../services/placeImages';
import { geocodePdfDraft } from '../services/geocoding';
import {
  addAccommodationImageIfMissing,
  addActivityImageIfMissing,
  createActivity,
  deleteAccommodation,
  deleteActivity,
  deleteDocument,
  deleteExpense,
  deletePackingItem,
  deleteReminder,
  duplicateActivity,
  exportBackup,
  getSnapshot,
  importBackup,
  moveActivity,
  putAccommodation,
  putDocument,
  putExpense,
  putPackingItem,
  putReminder,
  putSettings,
  reorderActivities,
  restoreInitialData,
  saveActivity,
  saveTrip,
  validateBackup,
} from '../services/storage';
import type { AppSnapshot } from '../services/storage';
import {
  AlertsInbox,
  FlightDetailView,
  FlightSettingsPanel,
  FlightsView,
  useAutomaticFlightRefresh,
} from './Flights';
import { TripsPanel } from './Trips';
import { ExploreView } from './Explore';

const today = new Date().toISOString().slice(0, 10);
const worldCenter: [number, number] = [20, 0];
const automaticPhotoAttempts = new Set<string>();
const exchangeRateAttempts = new Set<string>();

const markerIconComponents: Record<MapMarkerKind, LucideIcon> = {
  accommodation: BedDouble,
  food: Utensils,
  culture: Landmark,
  leisure: Ticket,
  nature: Trees,
  transport: Plane,
  shopping: ShoppingBag,
  emergency: Hospital,
  other: MapPin,
};

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => setSnapshot(await getSnapshot()), []);
  const notify = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
  }, []);

  useEffect(() => {
    void getSnapshot().then(setSnapshot);
  }, []);

  if (!snapshot) return <Splash />;

  return <LoadedApp snapshot={snapshot} refresh={refresh} notify={notify} notice={notice} />;
}

function LoadedApp({ snapshot, refresh, notify, notice }: ViewProps & { notice: string }) {
  useAutomaticFlightRefresh({ snapshot, refresh, notify });
  useExchangeRateRefresh(snapshot, refresh);
  useReminderScheduler(snapshot.reminders, refresh, notify);
  const unreadAlerts = snapshot.flightAlerts.filter((alert) => !alert.read).length;
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">TravelCaris</p>
          <h1>{snapshot.activeTrip.name}</h1>
        </div>
        <span className="status-pill">{unreadAlerts ? `${unreadAlerts} alertas` : 'Datos locales'}</span>
      </header>
      <main className="main-content" aria-live="polite">
        <Routes>
          <Route path="/" element={<TodayView snapshot={snapshot} refresh={refresh} notify={notify} />} />
          <Route path="/itinerario" element={<ItineraryView snapshot={snapshot} refresh={refresh} notify={notify} />} />
          <Route path="/itinerario/:activityId" element={<ActivityDetailView snapshot={snapshot} refresh={refresh} notify={notify} />} />
          <Route path="/explorar" element={<ExploreView snapshot={snapshot} refresh={refresh} notify={notify} />} />
          <Route path="/vuelos" element={<FlightsView snapshot={snapshot} refresh={refresh} notify={notify} />} />
          <Route path="/vuelos/:flightId" element={<FlightDetailView snapshot={snapshot} refresh={refresh} notify={notify} />} />
          <Route path="/mapa" element={<MapView snapshot={snapshot} refresh={refresh} notify={notify} />} />
          <Route path="/mas" element={<MoreView snapshot={snapshot} refresh={refresh} notify={notify} />} />
        </Routes>
      </main>
      <BottomNav />
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

function useExchangeRateRefresh(snapshot: AppSnapshot, refresh: () => Promise<void>) {
  const trip = snapshot.activeTrip;
  useEffect(() => {
    const base = trip.currency.toUpperCase();
    const quote = trip.secondaryCurrency.toUpperCase();
    const attemptKey = `${trip.id}|${base}|${quote}|${trip.exchangeRateUpdatedAt ?? ''}`;
    if (base === quote || !navigator.onLine || exchangeRateIsFresh(trip.exchangeRateUpdatedAt) || exchangeRateAttempts.has(attemptKey)) return;
    exchangeRateAttempts.add(attemptKey);
    let mounted = true;
    void fetchLatestExchangeRate(base, quote)
      .then(async (result) => {
        await saveTrip({
          ...trip,
          currency: result.base,
          secondaryCurrency: result.quote,
          exchangeRate: result.rate,
          exchangeRateDate: result.date,
          exchangeRateUpdatedAt: result.fetchedAt,
          exchangeRateSource: result.source,
        });
        if (mounted) await refresh();
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, [refresh, trip]);
}

function useReminderScheduler(reminders: Reminder[], refresh: () => Promise<void>, notify: (message: string) => void) {
  useEffect(() => {
    let active = true;
    let timeout = 0;
    const check = async () => {
      window.clearTimeout(timeout);
      const due = dueReminders(reminders);
      if (due.length) {
        const notifiedAt = new Date().toISOString();
        await Promise.all(due.map((reminder) => putReminder({ ...reminder, notifiedAt })));
        if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.ready.catch(() => null);
          if (registration) {
            const first = due[0];
            await registration.showNotification(first.title, {
              body: due.length > 1 ? `${due.length} recordatorios pendientes` : first.notes || 'Recordatorio de TravelCaris',
              icon: '/icons/icon-192.png',
              tag: `travelcaris-reminder-${first.id}`,
            }).catch(() => undefined);
          }
        }
        if (active) {
          notify(due.length > 1 ? `Tienes ${due.length} recordatorios pendientes` : `Recordatorio: ${due[0].title}`);
          await refresh();
        }
        return;
      }
      timeout = window.setTimeout(() => void check(), nextReminderDelay(reminders));
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [notify, refresh, reminders]);
}

function Splash() {
  return (
    <div className="splash">
      <div className="loader" />
      <p>Cargando TravelCaris...</p>
    </div>
  );
}

function BottomNav() {
  const items = [
    ['/', Home, 'Inicio'],
    ['/itinerario', CalendarDays, 'Itinerario'],
    ['/vuelos', Plane, 'Vuelos'],
    ['/mapa', MapIcon, 'Mapa'],
    ['/mas', MoreHorizontal, 'Más'],
  ] as const;
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {items.map(([to, Icon, label]) => (
        <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')} end={to === '/'}>
          <Icon size={21} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function TodayView({ snapshot, refresh, notify }: ViewProps) {
  const [currentTime] = useState(() => Date.now());
  const availableDays = tripDateRange(snapshot.activeTrip.startDate, snapshot.activeTrip.endDate);
  const [selectedDay, setSelectedDay] = useState<TripDay>(
    availableDays.includes(today) ? today : snapshot.activeTrip.startDate,
  );
  const dayActivities = useMemo(
    () => snapshot.activities.filter((activity) => activity.day === selectedDay && activity.planType !== 'Alternativa').sort((a, b) => a.order - b.order),
    [snapshot.activities, selectedDay],
  );
  const nextActivity = dayActivities.find((activity) => !activity.visited) ?? dayActivities[0];
  const accommodation = snapshot.accommodations.find(
    (item) => selectedDay >= item.startDate && selectedDay <= item.endDate,
  );
  const nextFlight = snapshot.flights.find((flight) => flight.scheduledDate >= selectedDay);
  const daysRemaining = Math.max(
    0,
    Math.ceil((new Date(`${snapshot.activeTrip.startDate}T12:00:00`).getTime() - currentTime) / 86_400_000),
  );
  const nextReminder = [...snapshot.reminders].filter((reminder) => !reminder.done).sort((left, right) => reminderTimestamp(left) - reminderTimestamp(right))[0];
  const emptyTrip = !snapshot.activities.length && !snapshot.accommodations.length && !snapshot.flights.length;
  const readiness = travelReadiness({ trip: snapshot.activeTrip, activities: snapshot.activities, accommodations: snapshot.accommodations, flights: snapshot.flights, documents: snapshot.documents, packingItems: snapshot.packingItems });

  return (
    <section className="page-stack">
      <Hero trip={snapshot.activeTrip} title={snapshot.activeTrip.destination} subtitle={formatDate(selectedDay)} action={<DaySelect value={selectedDay} days={availableDays} onChange={setSelectedDay} />} />
      <section className="home-summary">
        <div><span>Días restantes</span><strong>{daysRemaining}</strong></div>
        <div><span>Próximo vuelo</span><strong>{nextFlight?.flightNumber ?? 'Sin vuelo'}</strong></div>
        <div><span>Alertas</span><strong>{snapshot.flightAlerts.filter((alert) => !alert.read).length}</strong></div>
      </section>
      <div className="quick-links" aria-label="Accesos rápidos">
        <NavLink to="/itinerario"><CalendarDays size={19} /> Itinerario</NavLink>
        <NavLink to="/mapa"><MapIcon size={19} /> Mapa</NavLink>
        <NavLink to="/vuelos"><Plane size={19} /> Vuelos</NavLink>
        <NavLink to="/mas" onClick={() => sessionStorage.setItem('travelcaris-more-tab', 'Documentos')}><FileText size={19} /> Documentos</NavLink>
      </div>
      <section className="readiness-panel">
        <div className="readiness-heading"><div><p className="eyebrow">Preparación del viaje</p><h2>{readiness.completed === readiness.total ? 'Todo a punto' : `${readiness.completed} de ${readiness.total} pasos listos`}</h2></div><strong>{readiness.percentage}%</strong></div>
        <div className="readiness-progress" role="progressbar" aria-label="Preparación del viaje" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readiness.percentage}><span style={{ width: `${readiness.percentage}%` }} /></div>
        <div className="readiness-steps">
          {readiness.steps.map((step) => (
            <div key={step.id} className={`readiness-step ${step.done ? 'done' : ''}`}>
              <NavLink to={step.href} onClick={() => step.tab && sessionStorage.setItem('travelcaris-more-tab', step.tab)}>
                <span>{step.done ? <Check size={16} /> : <Clock3 size={16} />}{step.label}</span>
                <strong>{step.manuallyReviewed ? 'Revisado' : step.done ? 'Listo' : 'Revisar'}</strong>
              </NavLink>
              <button
                aria-label={`${step.manuallyReviewed ? 'Marcar pendiente' : 'Marcar como revisado'}: ${step.label}`}
                title={step.manuallyReviewed ? 'Volver a marcar pendiente' : 'Marcar como revisado'}
                onClick={async () => {
                  const overrides = new Set(snapshot.activeTrip.readinessOverrides ?? []);
                  if (overrides.has(step.id)) overrides.delete(step.id);
                  else overrides.add(step.id);
                  await saveTrip({ ...snapshot.activeTrip, readinessOverrides: [...overrides] });
                  await refresh();
                  notify(overrides.has(step.id) ? 'Paso marcado como revisado' : 'Paso marcado como pendiente');
                }}
              >
                {step.manuallyReviewed ? <RotateCcw size={16} /> : <BadgeCheck size={16} />}
              </button>
            </div>
          ))}
        </div>
      </section>
      {emptyTrip && (
        <section className="empty-state">
          <FileText size={28} />
          <div><h2>Empieza con tu información</h2><p>Importa el PDF del viaje o crea las actividades manualmente.</p></div>
          <NavLink className="primary" to="/mas" onClick={openPdfImport}>Importar PDF</NavLink>
        </section>
      )}
      <AlertsInbox snapshot={snapshot} refresh={refresh} notify={notify} compact />
      {nextReminder && (
        <section className={`reminder-summary ${reminderTimestamp(nextReminder) <= currentTime ? 'overdue' : ''}`}>
          <BellRing size={22} />
          <div><p className="eyebrow">Próximo recordatorio</p><strong>{nextReminder.title}</strong><span>{formatReminderDate(nextReminder.date, nextReminder.time)}</span></div>
          <NavLink to="/mas" onClick={() => sessionStorage.setItem('travelcaris-more-tab', 'Recordatorios')}>Ver</NavLink>
        </section>
      )}
      <section className="highlight-panel">
        <p className="eyebrow">Alojamiento activo</p>
        <h2>{accommodation?.name ?? 'Sin alojamiento asignado'}</h2>
        <p>{accommodation?.address ?? 'Puedes editar las fechas en Más > Alojamientos.'}</p>
        {accommodation && <MapButtons query={accommodation.address} />}
      </section>
      {nextActivity && (
        <section className="next-card">
          <p className="eyebrow">Próxima actividad</p>
          <h2>{nextActivity.title}</h2>
          <p>{nextActivity.startTime} · salida recomendada {recommendedDeparture(nextActivity.startTime)}</p>
          <p>{nextActivity.address}</p>
          <div className="button-row">
            <MapButtons query={nextActivity.address || nextActivity.title} />
            <button
              className="primary"
              onClick={async () => {
                await saveActivity({ ...nextActivity, visited: true, status: 'Realizado' });
                await refresh();
                notify('Actividad marcada como realizada');
              }}
            >
              <Check size={18} /> Realizada
            </button>
          </div>
        </section>
      )}
      <section className="timeline" aria-label="Resto del día">
        {dayActivities.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} trip={snapshot.activeTrip} availableDays={availableDays} refresh={refresh} notify={notify} staleDays={snapshot.settings.placeInfoStaleDays} compact />
        ))}
      </section>
      <section className="info-band">
        <strong>Acceso rápido</strong>
        <p>Billetes, reservas y documentos se guardan en Más &gt; Documentos. Mantén también copias en correo o Archivos del iPhone.</p>
      </section>
    </section>
  );
}

function ItineraryView({ snapshot, refresh, notify }: ViewProps) {
  const availableDays = tripDateRange(snapshot.activeTrip.startDate, snapshot.activeTrip.endDate);
  const [selectedDay, setSelectedDay] = useState<TripDay>(snapshot.activeTrip.startDate);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(true);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const allDayActivities = snapshot.activities.filter((activity) => activity.day === selectedDay).sort((a, b) => a.order - b.order);
  const dayActivities = allDayActivities.filter((activity) => activity.planType !== 'Alternativa');
  const alternatives = allDayActivities.filter((activity) => activity.planType === 'Alternativa');
  const gaps = dayActivities.length ? findItineraryGaps(dayActivities) : [];

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = dayActivities.findIndex((item) => item.id === active.id);
    const newIndex = dayActivities.findIndex((item) => item.id === over.id);
    const ordered = arrayMove(dayActivities, oldIndex, newIndex).map((item) => item.id);
    await reorderActivities(selectedDay, ordered);
    await refresh();
    notify('Orden actualizado');
  };

  return (
    <section className="page-stack">
      <Hero
        trip={snapshot.activeTrip}
        title="Itinerario"
        subtitle="Arrastra, edita, duplica o mueve actividades"
        action={<button className="primary" onClick={() => setShowNew(true)}><Plus size={18} /> Crear</button>}
      />
      <DayTabs selected={selectedDay} days={availableDays} onSelect={setSelectedDay} />
      {!allDayActivities.length && (
        <section className="itinerary-empty">
          <CalendarDays size={30} />
          <div><p className="eyebrow">Día libre</p><h2>Diseña este día a tu manera</h2><p>Añade una primera actividad o importa el plan completo del viaje.</p></div>
          <div className="button-row"><button className="primary" onClick={() => setShowNew(true)}><Plus size={18} /> Añadir actividad</button><NavLink className="external-button" to="/mas" onClick={openPdfImport}>Importar PDF</NavLink></div>
        </section>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={dayActivities.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <div className="timeline">
            {dayActivities.map((activity) => (
              <SortableActivity key={activity.id} activity={activity}>
                {(dragHandle) => <ActivityCard activity={activity} trip={snapshot.activeTrip} availableDays={availableDays} refresh={refresh} notify={notify} staleDays={snapshot.settings.placeInfoStaleDays} onEdit={() => setEditing(activity)} dragHandle={dragHandle} />}
              </SortableActivity>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {gaps.length > 0 && (
        <section className="gap-panel">
          <div>
            <p className="eyebrow">Huecos detectados</p>
            <h3>Ideas sin mover tu planificación</h3>
          </div>
          {gaps.map((gap) => (
            <NavLink
              key={`${gap.start}-${gap.end}`}
              to="/explorar"
              onClick={() => sessionStorage.setItem('travelcaris-explore-context', JSON.stringify({ kind: 'Zona del destino', label: `Hueco ${gap.start}-${gap.end}`, query: snapshot.activeTrip.destination }))}
            >
              <Clock3 size={17} /> {gap.start}-{gap.end} · Buscar cerca
            </NavLink>
          ))}
        </section>
      )}
      {alternatives.length > 0 && <section className="alternatives-section">
        <button className="section-toggle" onClick={() => setShowAlternatives((value) => !value)}>
          <span><strong>Alternativas del día</strong><small>{alternatives.length} guardadas</small></span>
          <span>{showAlternatives ? 'Ocultar' : 'Mostrar'}</span>
        </button>
        {showAlternatives && (
          <div className="timeline alternatives-list">
            {alternatives.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} trip={snapshot.activeTrip} availableDays={availableDays} refresh={refresh} notify={notify} staleDays={snapshot.settings.placeInfoStaleDays} onEdit={() => setEditing(activity)} />
            ))}
          </div>
        )}
      </section>}
      {(editing || showNew) && (
        <ActivityEditor
          activity={editing ?? undefined}
          trip={snapshot.activeTrip}
          availableDays={availableDays}
          defaultDay={selectedDay}
          onClose={() => {
            setEditing(null);
            setShowNew(false);
          }}
          onSaved={async () => {
            await refresh();
            notify('Actividad guardada');
          }}
        />
      )}
    </section>
  );
}

interface MapPlace {
  id: string;
  entity: 'activity' | 'accommodation';
  title: string;
  address: string;
  notes: string;
  category: Category;
  lat?: number;
  lng?: number;
  startDate: string;
  endDate: string;
  time: string;
}

interface CurrentLocation {
  lat: number;
  lng: number;
  accuracy: number;
}

function MapView({ snapshot, refresh, notify }: ViewProps) {
  const [day, setDay] = useState<'all' | TripDay>('all');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [online, setOnline] = useState(navigator.onLine);
  const [currentLocation, setCurrentLocation] = useState<CurrentLocation | null>(null);
  const [trackingLocation, setTrackingLocation] = useState(false);
  const [mapFocus, setMapFocus] = useState<[number, number] | null>(null);
  const [placementTarget, setPlacementTarget] = useState('');
  const [draftLocation, setDraftLocation] = useState<[number, number] | null>(null);
  const [locatingPending, setLocatingPending] = useState(false);
  const [locationProgress, setLocationProgress] = useState('');
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    const handler = () => setOnline(navigator.onLine);
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }, []);

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current);
  }, []);

  const allPlaces = useMemo<MapPlace[]>(() => ([
    ...snapshot.activities.map((activity) => ({
      id: activity.id,
      entity: 'activity' as const,
      title: activity.title,
      address: activity.address,
      notes: activity.notes,
      category: activity.category,
      lat: activity.lat,
      lng: activity.lng,
      startDate: activity.day,
      endDate: activity.day,
      time: activity.startTime,
    })),
    ...snapshot.accommodations.map((accommodation) => ({
      id: accommodation.id,
      entity: 'accommodation' as const,
      title: accommodation.name,
      address: accommodation.address,
      notes: accommodation.notes,
      category: 'Alojamiento' as const,
      lat: accommodation.lat,
      lng: accommodation.lng,
      startDate: accommodation.startDate,
      endDate: accommodation.endDate,
      time: accommodation.checkIn,
    })),
  ]).filter(isMapRelevantPlace), [snapshot.accommodations, snapshot.activities]);

  const filteredPlaces = allPlaces.filter((place) =>
    (day === 'all' || (day >= place.startDate && day <= place.endDate)) &&
    (category === 'all' || place.category === category),
  );
  const locatedPlaces = filteredPlaces.filter(hasMapCoordinates);
  const positionablePlaces = [...allPlaces].sort((a, b) =>
    Number(hasMapCoordinates(a)) - Number(hasMapCoordinates(b)) || a.title.localeCompare(b.title),
  );
  const pendingPlaceCount = positionablePlaces.filter((place) => !hasMapCoordinates(place)).length;
  const mapCenter: [number, number] = locatedPlaces.length
    ? [
        locatedPlaces.reduce((sum, place) => sum + place.lat!, 0) / locatedPlaces.length,
        locatedPlaces.reduce((sum, place) => sum + place.lng!, 0) / locatedPlaces.length,
      ]
    : worldCenter;

  const startLocationTracking = () => {
    if (!navigator.geolocation) {
      notify('Este navegador no ofrece ubicación');
      return;
    }
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    setTrackingLocation(true);
    let receivedLocation = false;
    let activeWatchId: number | null = null;
    activeWatchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const location = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
        setCurrentLocation(location);
        setMapFocus([location.lat, location.lng]);
        if (!receivedLocation) notify('Ubicación actualizada para esta sesión');
        receivedLocation = true;
      },
      () => {
        if (activeWatchId !== null) navigator.geolocation.clearWatch(activeWatchId);
        setTrackingLocation(false);
        watchId.current = null;
        notify('No se pudo obtener la ubicación. Revisa el permiso del navegador.');
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
    watchId.current = activeWatchId;
  };

  const stopLocationTracking = () => {
    if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current);
    watchId.current = null;
    setTrackingLocation(false);
    notify('Seguimiento detenido');
  };

  const saveDraftLocation = async () => {
    if (!placementTarget || !draftLocation) return;
    const [entity, id] = placementTarget.split(':');
    if (entity === 'activity') {
      const activity = snapshot.activities.find((item) => item.id === id);
      if (activity) await saveActivity({ ...activity, lat: draftLocation[0], lng: draftLocation[1] });
    } else {
      const accommodation = snapshot.accommodations.find((item) => item.id === id);
      if (accommodation) await putAccommodation({ ...accommodation, lat: draftLocation[0], lng: draftLocation[1] });
    }
    setPlacementTarget('');
    setMapFocus(draftLocation);
    setDraftLocation(null);
    await refresh();
    notify('Punto guardado en el mapa');
  };

  const locatePendingPlaces = async () => {
    if (!online || !pendingPlaceCount) return;
    setLocatingPending(true);
    setLocationProgress('Preparando lugares pendientes...');
    try {
      const result = await geocodePdfDraft({
        fileName: '',
        trip: snapshot.activeTrip,
        activities: snapshot.activities,
        accommodations: snapshot.accommodations,
        flights: [],
        reminders: [],
        packingItems: [],
        warnings: [],
      }, {
        onProgress: (current, total, label) => setLocationProgress(`Ubicando ${current} de ${total}: ${label}`),
      });
      const writes: Promise<unknown>[] = [];
      result.draft.activities.forEach((activity, index) => {
        const original = snapshot.activities[index];
        if (original && Number.isFinite(activity.lat) && Number.isFinite(activity.lng) &&
          (original.lat !== activity.lat || original.lng !== activity.lng)) {
          writes.push(saveActivity({ ...original, lat: activity.lat, lng: activity.lng }));
        }
      });
      result.draft.accommodations.forEach((accommodation, index) => {
        const original = snapshot.accommodations[index];
        if (original && Number.isFinite(accommodation.lat) && Number.isFinite(accommodation.lng) &&
          (original.lat !== accommodation.lat || original.lng !== accommodation.lng)) {
          writes.push(putAccommodation({ ...original, lat: accommodation.lat, lng: accommodation.lng }));
        }
      });
      await Promise.all(writes);
      await refresh();
      notify(result.located
        ? `${result.located} lugares ubicados automáticamente${result.unresolved ? `; ${result.unresolved} siguen pendientes` : ''}`
        : 'No se encontraron coordenadas nuevas. Revisa las direcciones pendientes.');
    } finally {
      setLocatingPending(false);
      setLocationProgress('');
    }
  };

  return (
    <section className="page-stack map-page">
      <Hero trip={snapshot.activeTrip} title="Mapa" subtitle="Tu viaje, organizado por tipo de lugar" />
      <div className="map-toolbar">
        <div className="filters map-filters">
          <label>
            <span>Día</span>
            <select value={day} onChange={(event) => { setDay(event.target.value as 'all' | TripDay); setMapFocus(null); }}>
              <option value="all">Todos los días</option>
              {tripDateRange(snapshot.activeTrip.startDate, snapshot.activeTrip.endDate).map((tripDay) => <option key={tripDay} value={tripDay}>{formatDate(tripDay)}</option>)}
            </select>
          </label>
          <label>
            <span>Tipo de lugar</span>
            <select value={category} onChange={(event) => { setCategory(event.target.value as 'all' | Category); setMapFocus(null); }}>
              <option value="all">Todas las categorías</option>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <button
          className={trackingLocation ? 'location-control active' : 'location-control'}
          onClick={trackingLocation ? stopLocationTracking : startLocationTracking}
        >
          {trackingLocation ? <X size={18} /> : <LocateFixed size={18} />}
          {trackingLocation ? 'Detener seguimiento' : 'Mostrar mi ubicación'}
        </button>
      </div>

      <div className="map-legend" aria-label="Leyenda del mapa">
        {mapMarkerLegend.map((item) => {
          const Icon = markerIconComponents[item.kind];
          return <span key={item.kind}><i style={{ backgroundColor: item.color }}><Icon size={14} /></i>{item.label}</span>;
        })}
      </div>

      <div className="map-placement-panel">
        <MapPinned size={20} />
        <label>
          <span>Asignar o corregir un punto</span>
          <select
            aria-label="Lugar que quieres ubicar"
            value={placementTarget}
            onChange={(event) => {
              setPlacementTarget(event.target.value);
              setDraftLocation(null);
            }}
          >
            <option value="">Selecciona un lugar</option>
            {positionablePlaces.map((place) => (
              <option key={`${place.entity}:${place.id}`} value={`${place.entity}:${place.id}`}>
                {hasMapCoordinates(place) ? 'Actualizar' : 'Sin ubicar'} · {place.title}
              </option>
            ))}
          </select>
        </label>
        <div className="map-placement-status">
          <p>{placementTarget ? 'Toca el punto exacto en el mapa y confirma la ubicación.' : `${filteredPlaces.length - locatedPlaces.length} lugares del filtro todavía no tienen coordenadas.`}</p>
          {!placementTarget && pendingPlaceCount > 0 && (
            <button className="secondary" disabled={!online || locatingPending} onClick={locatePendingPlaces}>
              {locatingPending ? <LoaderCircle className="spinning" size={17} /> : <LocateFixed size={17} />}
              {locatingPending ? 'Ubicando...' : `Ubicar ${pendingPlaceCount} pendientes`}
            </button>
          )}
          {locationProgress && <span role="status">{locationProgress}</span>}
        </div>
      </div>

      {!online && <div className="info-band">El listado guardado funciona sin conexión. Las teselas de OpenStreetMap necesitan internet.</div>}
      <div className={`map-wrap ${placementTarget ? 'is-placing' : ''}`} data-testid="trip-map">
        <MapContainer center={mapCenter} zoom={locatedPlaces.length ? 12 : 2} scrollWheelZoom className="leaflet-map">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapViewport focus={mapFocus} center={mapCenter} zoom={locatedPlaces.length ? 12 : 2} />
          <MapClickCapture enabled={Boolean(placementTarget)} onSelect={setDraftLocation} />
          {locatedPlaces.map((place) => {
            const style = mapMarkerStyle(place.category);
            return (
              <Marker key={`${place.entity}:${place.id}`} position={[place.lat!, place.lng!]} icon={createMapMarkerIcon(style.kind, style.color)}>
                <Popup>
                  <div className="map-popup">
                    <span className="map-popup-type">{style.label}</span>
                    <strong>{place.title}</strong>
                    {(place.time || place.address) && <p>{[place.time, place.address].filter(Boolean).join(' · ')}</p>}
                    {place.notes && <p>{place.notes}</p>}
                    <div className="map-popup-actions">
                      <a href={googleMapsSearch(place.address || place.title)} target="_blank" rel="noreferrer"><Navigation size={15} /> Google Maps</a>
                      <button
                        onClick={() => {
                          sessionStorage.setItem('travelcaris-map-marker', JSON.stringify({
                            kind: 'Marcador del mapa',
                            label: place.title,
                            query: place.address || place.title,
                            lat: place.lat,
                            lng: place.lng,
                            activityId: place.entity === 'activity' ? place.id : undefined,
                          }));
                          notify('Marcador listo para usar en Explorar');
                        }}
                      >
                        <MapPin size={15} /> Explorar
                      </button>
                      {place.entity === 'activity' && (
                        <button
                          onClick={async () => {
                            const activity = snapshot.activities.find((item) => item.id === place.id);
                            if (!activity) return;
                            await saveActivity({ ...activity, visited: true, status: 'Realizado' });
                            await refresh();
                            notify('Marcada como realizada');
                          }}
                        >
                          <Check size={15} /> Realizada
                        </button>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
          {draftLocation && (
            <Marker position={draftLocation} icon={createDraftMarkerIcon()}>
              <Popup>Nuevo punto pendiente de confirmar</Popup>
            </Marker>
          )}
          {currentLocation && (
            <>
              <Circle center={[currentLocation.lat, currentLocation.lng]} radius={currentLocation.accuracy} pathOptions={{ color: '#1479c9', fillColor: '#4ca6e8', fillOpacity: 0.13, weight: 1 }} />
              <Marker position={[currentLocation.lat, currentLocation.lng]} icon={createCurrentLocationIcon()}>
                <Popup><strong>Estás aquí</strong><p>Precisión aproximada: {Math.round(currentLocation.accuracy)} m</p></Popup>
              </Marker>
            </>
          )}
        </MapContainer>
      </div>
      {draftLocation && (
        <div className="map-confirmation" role="status">
          <div><strong>Punto seleccionado</strong><span>{draftLocation[0].toFixed(5)}, {draftLocation[1].toFixed(5)}</span></div>
          <button className="secondary" onClick={() => setDraftLocation(null)}><X size={17} /> Cancelar</button>
          <button className="primary" onClick={saveDraftLocation}><Check size={17} /> Guardar punto</button>
        </div>
      )}
      {!filteredPlaces.length && <div className="map-empty-state"><MapPin size={23} /><p>No hay lugares para este filtro. Añádelos al itinerario o importa un PDF.</p></div>}
    </section>
  );
}

function hasMapCoordinates(place: Pick<MapPlace, 'lat' | 'lng'>): place is MapPlace & { lat: number; lng: number } {
  return Number.isFinite(place.lat) && Number.isFinite(place.lng);
}

function isMapRelevantPlace(place: MapPlace) {
  if (place.entity === 'accommodation' || hasMapCoordinates(place)) return true;
  if (['Transporte', 'Aeropuerto'].includes(place.category)) return false;
  return !/^(?:desayuno|comida|cena|equipaje|preparar|recoger|salida|llegada|traslado|vuelo|decision|segun horario|revisar|llamar|reservar)\b/i.test(foldMapText(place.title));
}

function foldMapText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function MapClickCapture({ enabled, onSelect }: { enabled: boolean; onSelect: (point: [number, number]) => void }) {
  useMapEvents({
    click(event) {
      if (enabled) onSelect([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

function MapViewport({ focus, center, zoom }: { focus: [number, number] | null; center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(focus ?? center, focus ? 16 : zoom, { animate: true });
  }, [center, focus, map, zoom]);
  return null;
}

function createMapMarkerIcon(kind: MapMarkerKind, color: string) {
  const Icon = markerIconComponents[kind];
  return divIcon({
    className: 'travel-map-marker-host',
    html: renderToStaticMarkup(<span className="travel-map-marker" data-marker-kind={kind} style={{ backgroundColor: color }}><Icon size={18} strokeWidth={2.4} /></span>),
    iconSize: [38, 46],
    iconAnchor: [19, 44],
    popupAnchor: [0, -40],
  });
}

function createDraftMarkerIcon() {
  return divIcon({
    className: 'travel-map-marker-host',
    html: renderToStaticMarkup(<span className="travel-map-marker draft"><MapPinned size={18} /></span>),
    iconSize: [38, 46],
    iconAnchor: [19, 44],
    popupAnchor: [0, -40],
  });
}

function createCurrentLocationIcon() {
  return divIcon({
    className: 'travel-map-marker-host',
    html: renderToStaticMarkup(<span className="current-location-marker" data-testid="current-location-marker"><Navigation size={17} fill="currentColor" /></span>),
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

function MoreView({ snapshot, refresh, notify }: ViewProps) {
  const [tab, setTab] = useState(() => sessionStorage.getItem('travelcaris-more-tab') ?? 'Viajes');
  const selectTab = (nextTab: string) => {
    sessionStorage.setItem('travelcaris-more-tab', nextTab);
    setTab(nextTab);
  };
  const tabs: Array<[string, LucideIcon]> = [
    ['Viajes', MapPinned], ['Alojamientos', BedDouble], ['Explorar', LocateFixed], ['Transportes', Navigation],
    ['Documentos', FileText], ['Gastos', Euro], ['Equipaje', Luggage], ['Recordatorios', BellRing],
    ['Vuelos', Plane], ['Instalar', Download], ['Ajustes', Settings],
  ];
  return (
    <section className="page-stack">
      <Hero trip={snapshot.activeTrip} title="Más" subtitle="Viajes, reservas, gastos, listas y ajustes" />
      <div className="tabs more-tabs" aria-label="Herramientas del viaje">
        {tabs.map(([item, Icon]) => (
          <button key={item} className={tab === item ? 'selected' : ''} onClick={() => selectTab(item)}><Icon size={17} /><span>{item}</span></button>
        ))}
      </div>
      {tab === 'Viajes' && <TripsPanel snapshot={snapshot} refresh={refresh} notify={notify} />}
      {tab === 'Alojamientos' && <AccommodationsPanel snapshot={snapshot} refresh={refresh} notify={notify} />}
      {tab === 'Explorar' && <ExploreView snapshot={snapshot} refresh={refresh} notify={notify} />}
      {tab === 'Transportes' && <TransportPanel snapshot={snapshot} />}
      {tab === 'Documentos' && <DocumentsPanel snapshot={snapshot} refresh={refresh} notify={notify} />}
      {tab === 'Gastos' && <ExpensesPanel snapshot={snapshot} refresh={refresh} notify={notify} />}
      {tab === 'Equipaje' && <PackingPanel snapshot={snapshot} refresh={refresh} notify={notify} />}
      {tab === 'Recordatorios' && <RemindersPanel snapshot={snapshot} refresh={refresh} notify={notify} />}
      {tab === 'Vuelos' && <FlightSettingsPanel snapshot={snapshot} refresh={refresh} notify={notify} />}
      {tab === 'Instalar' && <InstallPanel />}
      {tab === 'Ajustes' && <SettingsPanel snapshot={snapshot} refresh={refresh} notify={notify} />}
    </section>
  );
}

interface ViewProps {
  snapshot: AppSnapshot;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}

function Hero({ trip, title, subtitle, action }: { trip: Trip; title: string; subtitle: string; action?: React.ReactNode }) {
  const style = trip.coverImage ? { '--hero-image': `url("${trip.coverImage.replace(/"/g, '%22')}")` } as React.CSSProperties : undefined;
  return (
    <section className="hero" style={style}>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
        {trip.coverImageAttribution && <small className="hero-credit">{trip.coverImageSourceUrl ? <a href={trip.coverImageSourceUrl} target="_blank" rel="noreferrer">{trip.coverImageAttribution}</a> : trip.coverImageAttribution}</small>}
      </div>
      {action}
    </section>
  );
}

function ActivityDetailView({ snapshot, refresh, notify }: ViewProps) {
  const { activityId } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const activity = snapshot.activities.find((item) => item.id === activityId);
  const availableDays = tripDateRange(snapshot.activeTrip.startDate, snapshot.activeTrip.endDate);

  if (!activity) {
    return (
      <section className="form-card">
        <h2>Actividad no encontrada</h2>
        <p>Puede que se haya eliminado o pertenezca a otro viaje.</p>
        <button onClick={() => navigate('/itinerario')}>Volver al itinerario</button>
      </section>
    );
  }

  const photo = activity.gallery.find((image) => image.dataUrl === activity.mainImage) ?? activity.gallery[0];
  const priceDetails = activity.priceDetails;
  const practicalDetails = [
    ['Entorno', activity.environment],
    ['Accesibilidad', activity.accessibility],
    ['Edad mínima', activity.minimumAge],
    ['Plan de lluvia', activity.rainPlan],
    ['Horario especial', activity.specialHours],
  ].filter(([, value]) => value && value !== 'Sin indicar');
  const categoryDetails = [
    ['Punto de encuentro', activity.meetingPoint],
    ['Proveedor del tour', activity.tourProvider],
    ['Idioma', activity.tourLanguage],
    ['Tipo de tour', activity.tourType],
    ['Propina orientativa', activity.tipGuidance],
    ['Cocina', activity.restaurantCuisine],
    ['Tipo de comida', activity.mealType],
    ['Opciones alimentarias', activity.dietaryOptions],
    ['Plataforma de reserva', activity.bookingPlatform],
    ['Tipo de ocio', activity.leisureType],
    ['Sesión', activity.showTime],
    ['Recinto', activity.venue],
  ].filter(([, value]) => Boolean(value));

  return (
    <section className="page-stack activity-detail-page">
      <button className="back-button" onClick={() => navigate('/itinerario')}><X size={18} /> Cerrar detalle</button>
      <header className="activity-detail-header">
        {activity.mainImage && (
          <figure>
            <img src={activity.mainImage} alt={activity.title} />
            <PhotoCredit image={photo} />
          </figure>
        )}
        <div>
          <p className="eyebrow">{activity.category}{activity.planType === 'Alternativa' ? ' · Alternativa' : ''}</p>
          <h2>{activity.title}</h2>
          {activity.description && <p>{activity.description}</p>}
          <div className="meta-row">
            <span>{activity.status}</span>
            <span>{formatDate(activity.day)}</span>
            <span>{activity.startTime}{activity.endTime ? `-${activity.endTime}` : ''}</span>
          </div>
        </div>
      </header>

      <div className="button-row activity-detail-commands">
        <button className="primary" onClick={() => setEditing(true)}><Edit3 size={18} /> Editar actividad</button>
        <MapButtons query={activity.address || activity.title} />
        {isSafeExternalUrl(activity.officialLink) && <a className="external-button" href={activity.officialLink} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Web oficial</a>}
        {isSafeExternalUrl(activity.reservationLink) && <a className="external-button" href={activity.reservationLink} target="_blank" rel="noreferrer"><Ticket size={18} /> Reserva</a>}
        <button onClick={async () => { await saveActivity({ ...activity, visited: !activity.visited, status: activity.visited ? 'Pendiente' : 'Realizado' }); await refresh(); notify(activity.visited ? 'Actividad reabierta' : 'Actividad realizada'); }}><Check size={18} /> {activity.visited ? 'Reabrir' : 'Marcar realizada'}</button>
      </div>

      <div className="activity-detail-grid">
        <ActivityDetailSection title="Plan del día">
          <ActivityDetailRow label="Fecha" value={formatDate(activity.day)} />
          <ActivityDetailRow label="Horario" value={`${activity.startTime}${activity.endTime ? `-${activity.endTime}` : ''}`} />
          <ActivityDetailRow label="Duración" value={`${activity.estimatedDurationMinutes} min`} />
          <ActivityDetailRow label="Dirección" value={activity.address || 'Sin dirección'} />
          {activity.phone && <ActivityDetailRow label="Teléfono" value={activity.phone} />}
        </ActivityDetailSection>

        <ActivityDetailSection title="Precio y reserva">
          <ActivityDetailRow label="Precio" value={priceLabel(activity, snapshot.activeTrip)} />
          <ActivityDetailRow label="Reserva" value={activity.reservationStatus} />
          {priceDetails.adult > 0 && <ActivityDetailRow label="Adulto" value={formatMoney(priceDetails.adult, priceDetails.currency)} />}
          {priceDetails.child > 0 && <ActivityDetailRow label="Niño" value={formatMoney(priceDetails.child, priceDetails.currency)} />}
          {priceDetails.family > 0 && <ActivityDetailRow label="Familia" value={formatMoney(priceDetails.family, priceDetails.currency)} />}
          {activity.bookingDeadline && <ActivityDetailRow label="Plazo" value={activity.bookingDeadline} />}
          {activity.cancellationPolicy && <ActivityDetailRow label="Cancelación" value={activity.cancellationPolicy} />}
          {activity.reservationReference && <ActivityDetailRow label="Referencia local" value={activity.reservationReference} />}
        </ActivityDetailSection>

        <ActivityDetailSection title="Información práctica">
          {activity.openingHoursNote && <ActivityDetailRow label="Horario de apertura" value={activity.openingHoursNote} />}
          {practicalDetails.map(([label, value]) => <ActivityDetailRow key={label} label={label} value={value} />)}
          <ActivityDetailRow label="Familiar" value={activity.familyFriendly ? 'Sí' : 'Sin indicar'} />
          <ActivityDetailRow label="Apto para carrito" value={activity.strollerFriendly ? 'Sí' : 'Sin indicar'} />
        </ActivityDetailSection>

        {(categoryDetails.length > 0 || activity.notes) && (
          <ActivityDetailSection title="Detalles del evento">
            {categoryDetails.map(([label, value]) => <ActivityDetailRow key={label} label={label} value={value} />)}
            {activity.notes && <ActivityDetailRow label="Notas" value={activity.notes} />}
          </ActivityDetailSection>
        )}

        <ActivityDetailSection title="Fuente y revisión">
          <ActivityDetailRow label="Estado" value={activity.verificationStatus} />
          <ActivityDetailRow label="Última comprobación" value={activity.lastVerifiedAt ? formatDate(activity.lastVerifiedAt) : 'Pendiente'} />
          {activity.sourceName && <ActivityDetailRow label="Fuente" value={activity.sourceName} />}
          {activity.verificationNote && <ActivityDetailRow label="Nota" value={activity.verificationNote} />}
        </ActivityDetailSection>
      </div>

      <div className="danger-zone">
        <h3>Eliminar actividad</h3>
        <p>Esta acción elimina la actividad del itinerario de este dispositivo.</p>
        <button className="danger-button" onClick={async () => { if (!confirm(`¿Eliminar “${activity.title}”?`)) return; await deleteActivity(activity.id); await refresh(); notify('Actividad eliminada'); navigate('/itinerario'); }}><Trash2 size={18} /> Eliminar actividad</button>
      </div>

      {editing && <ActivityEditor activity={activity} trip={snapshot.activeTrip} availableDays={availableDays} defaultDay={activity.day} onClose={() => setEditing(false)} onSaved={async () => { await refresh(); setEditing(false); notify('Actividad actualizada'); }} />}
    </section>
  );
}

function ActivityDetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3>{children}</section>;
}

function ActivityDetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>;
}

function ActivityCard({ activity, trip, availableDays, refresh, notify, onEdit, dragHandle, staleDays = 30, compact = false }: {
  activity: Activity;
  trip: Trip;
  availableDays: string[];
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  onEdit?: () => void;
  dragHandle?: React.ReactNode;
  staleDays?: number;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const stale = isActivityStale(activity, staleDays);
  const [photoLoading, setPhotoLoading] = useState(false);
  const photo = activity.gallery.find((image) => image.dataUrl === activity.mainImage) ?? activity.gallery[0];
  useEffect(() => {
    const attemptKey = `activity|${activity.id}|${activity.title}|${activity.address}`;
    if (activity.mainImage || !navigator.onLine || automaticPhotoAttempts.has(attemptKey)) return;
    automaticPhotoAttempts.add(attemptKey);
    let mounted = true;
    void Promise.resolve()
      .then(() => {
        if (mounted) setPhotoLoading(true);
        return findAndStorePlaceImage(activity.title, activity.address);
      })
      .then(async (image) => {
        if (!image) return;
        const saved = await addActivityImageIfMissing(activity.id, image);
        if (saved && mounted) await refresh();
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setPhotoLoading(false);
      });
    return () => { mounted = false; };
  }, [activity.address, activity.id, activity.mainImage, activity.title, refresh]);
  const doShare = async () => {
    const text = shareText(activity.title, [activity.startTime, activity.address, activity.notes]);
    try {
      if (navigator.share) await navigator.share({ title: activity.title, text });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        notify('Copiado al portapapeles');
      } else notify('Compartir no está disponible en este navegador');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notify('No se pudo compartir la actividad');
    }
  };
  return (
    <article className={`activity-card ${activity.visited ? 'done' : ''} ${activity.planType === 'Alternativa' ? 'alternative' : ''}`}>
      {activity.mainImage && (
        <figure className="activity-photo">
          <img className="activity-image" src={activity.mainImage} alt={activity.title} />
          <PhotoCredit image={photo} />
        </figure>
      )}
      {photoLoading && <div className="photo-loading" role="status"><LoaderCircle className="spinning" size={18} /> Buscando fotografía del lugar</div>}
      <div className={`category-dot ${activity.category.toLowerCase().replace(/\s/g, '-')}`} aria-hidden="true" />
      <div className="activity-main">
        <div className="activity-title-row">
          <span className="time">{activity.startTime}{activity.endTime ? `-${activity.endTime}` : ''}</span>
          <h3><NavLink className="activity-title-link" to={`/itinerario/${activity.id}`}>{activity.title}</NavLink></h3>
        </div>
        <p>{activity.description}</p>
        {!compact && <p className="muted">{activity.address}</p>}
        <div className="meta-row">
          <span>{activity.category}</span>
          {activity.planType === 'Alternativa' && <span>Alternativa</span>}
          <span>{activity.estimatedDurationMinutes} min</span>
          <span>{activity.reservationStatus}</span>
          {activity.priority === 'Premium' && <span>Premium</span>}
          <span>{priceLabel(activity, trip)}</span>
          {stale && <span className="warning-chip">Verificar datos</span>}
        </div>
        {!compact && activity.openingHoursNote && <p className="detail-line"><strong>Horario:</strong> {activity.openingHoursNote}</p>}
        {!compact && activity.rainPlan && <p className="detail-line"><strong>Lluvia:</strong> {activity.rainPlan}</p>}
        {!compact && (activity.strollerFriendly || activity.accessibility) && <p className="detail-line"><strong>Acceso:</strong> {activity.strollerFriendly ? 'Apto para carrito. ' : ''}{activity.accessibility}</p>}
        <div className="activity-actions">
          <NavLink className="activity-detail-link" aria-label={`Ver detalles de ${activity.title}`} to={`/itinerario/${activity.id}`}><Info size={18} /><span>Ver detalles</span></NavLink>
          {dragHandle}
          {onEdit && <button aria-label="Editar actividad" onClick={onEdit}><Edit3 size={18} /><span>Editar</span></button>}
          {stale && <button aria-label="Marcar datos como revisados" onClick={async () => { await saveActivity({ ...activity, verificationStatus: 'Verificado', lastVerifiedAt: new Date().toISOString().slice(0, 10) }); await refresh(); notify('Datos de la actividad marcados como revisados'); }}><BadgeCheck size={18} /><span>Revisado</span></button>}
          <a aria-label="Abrir mapa" href={googleMapsSearch(activity.address || activity.title)} target="_blank" rel="noreferrer"><MapIcon size={18} /><span>Mapa</span></a>
          <button aria-label={activity.visited ? 'Marcar como pendiente' : 'Marcar como realizada'} onClick={async () => { await saveActivity({ ...activity, visited: !activity.visited, status: activity.visited ? 'Pendiente' : 'Realizado' }); await refresh(); notify(activity.visited ? 'Actividad reabierta' : 'Actividad realizada'); }}><Check size={18} /><span>{activity.visited ? 'Reabrir' : 'Realizada'}</span></button>
          {!compact && (
            <details className="activity-more-actions">
              <summary><MoreHorizontal size={18} /><span>Más acciones</span></summary>
              <div>
                <button aria-label="Duplicar actividad" onClick={async () => { await duplicateActivity(activity); await refresh(); notify('Actividad duplicada'); }}><ClipboardList size={18} /><span>Duplicar</span></button>
                <button aria-label="Compartir actividad" onClick={doShare}><Share2 size={18} /><span>Compartir</span></button>
                {isSafeExternalUrl(activity.officialLink) && <a aria-label="Abrir web oficial" href={activity.officialLink} target="_blank" rel="noreferrer"><ExternalLink size={18} /><span>Web oficial</span></a>}
                {isSafeExternalUrl(activity.reservationLink) && <a aria-label="Abrir reserva" href={activity.reservationLink} target="_blank" rel="noreferrer"><FileText size={18} /><span>Reserva</span></a>}
                <button aria-label="Mover a otro día" onClick={async () => { const next = availableDays[(availableDays.indexOf(activity.day) + 1) % availableDays.length]; await moveActivity(activity.id, next); await refresh(); notify(`Movida a ${formatDate(next)}`); navigate('/itinerario'); }}><CalendarDays size={18} /><span>Cambiar día</span></button>
                <button className="danger-button" aria-label="Eliminar actividad" onClick={async () => { if (confirm('¿Eliminar esta actividad?')) { await deleteActivity(activity.id); await refresh(); notify('Actividad eliminada'); } }}><Trash2 size={18} /><span>Eliminar</span></button>
              </div>
            </details>
          )}
        </div>
      </div>
    </article>
  );
}

function SortableActivity({ activity, children }: { activity: Activity; children: (dragHandle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: activity.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      {children(
        <button className="drag-handle" aria-label={`Reordenar ${activity.title}`} title="Arrastrar para ordenar" {...attributes} {...listeners}>
          <GripVertical size={18} /><span>Ordenar</span>
        </button>,
      )}
    </div>
  );
}

function ActivityEditor({ activity, trip, availableDays, defaultDay, onClose, onSaved }: {
  activity?: Activity;
  trip: Trip;
  availableDays: string[];
  defaultDay: TripDay;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Activity>>(activity ?? {
    title: '',
    day: defaultDay,
    startTime: '10:00',
    endTime: '',
    estimatedDurationMinutes: 60,
    category: 'Otros',
    status: 'Pendiente',
    planType: 'Principal',
    currency: trip.currency,
    openingHours: emptyWeeklyOpeningHours(),
    priceDetails: emptyPriceDetails(trip.currency),
    reservationStatus: 'No necesaria',
    verificationStatus: 'Pendiente de verificar',
    environment: 'Sin indicar',
  });
  const [error, setError] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const set = <K extends keyof Activity>(key: K, value: Activity[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setPrice = <K extends keyof Activity['priceDetails']>(key: K, value: Activity['priceDetails'][K]) =>
    setForm((current) => ({ ...current, priceDetails: { ...emptyPriceDetails(current.currency ?? trip.currency), ...(current.priceDetails ?? {}), [key]: value } }));
  const searchPhoto = async () => {
    if (!form.title?.trim()) return setError('Escribe primero el nombre del lugar.');
    setPhotoLoading(true);
    setError('');
    try {
      const image = await findAndStorePlaceImage(form.title, form.address, true);
      if (!image) return setError('No se encontró una fotografía adecuada. Puedes añadir una desde tu dispositivo.');
      setForm((current) => ({
        ...current,
        mainImage: image.dataUrl,
        gallery: [...(current.gallery ?? []).filter((item) => !item.automatic), image],
      }));
    } catch {
      setError('No se pudo buscar la fotografía. La actividad puede guardarse igualmente.');
    } finally {
      setPhotoLoading(false);
    }
  };
  const submit = async () => {
    if (!form.title?.trim()) return setError('El título es obligatorio.');
    if (!form.day || !availableDays.includes(form.day)) return setError('Selecciona un día válido.');
    if (form.officialLink && !isUrl(form.officialLink)) return setError('El enlace oficial no tiene un formato válido.');
    if (form.reservationLink && !isUrl(form.reservationLink)) return setError('El enlace de reserva no tiene un formato válido.');
    const normalized = {
      ...form,
      day: form.day as TripDay,
      date: form.day as string,
      status: form.planType === 'Alternativa' ? 'Alternativa' as const : form.status ?? 'Pendiente',
      reservationRequired: ['Necesaria', 'Pendiente', 'Reservada'].includes(form.reservationStatus ?? ''),
      reservationDone: form.reservationStatus === 'Reservada',
      adultPrice: form.priceDetails?.adult ?? 0,
      childPrice: form.priceDetails?.child ?? 0,
      estimatedTotalPrice: form.priceDetails?.totalEstimate ?? 0,
      currency: form.priceDetails?.currency ?? form.currency ?? trip.currency,
    };
    if (activity) await saveActivity({ ...activity, ...normalized });
    else await createActivity({ ...normalized, title: form.title, day: form.day as TripDay });
    await onSaved();
    onClose();
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Editor de actividad">
      <div className="modal modal-wide">
        <h2>{activity ? 'Editar actividad' : 'Crear actividad'}</h2>
        {error && <p className="error">{error}</p>}
        <label>Título<input value={form.title ?? ''} onChange={(event) => set('title', event.target.value)} /></label>
        <div className="three-cols">
          <label>Día<select value={form.day} onChange={(event) => set('day', event.target.value as TripDay)}>{availableDays.map((day) => <option key={day}>{day}</option>)}</select></label>
          <label>Inicio<input type="time" value={form.startTime ?? ''} onChange={(event) => set('startTime', event.target.value)} /></label>
          <label>Fin<input type="time" value={form.endTime ?? ''} onChange={(event) => set('endTime', event.target.value)} /></label>
        </div>
        <div className="three-cols">
          <label>Duración (min)<input type="number" min="0" value={form.estimatedDurationMinutes ?? 60} onChange={(event) => set('estimatedDurationMinutes', Number(event.target.value))} /></label>
          <label>Categoría<select value={form.category} onChange={(event) => set('category', event.target.value as Activity['category'])}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Plan<select value={form.planType} onChange={(event) => set('planType', event.target.value as Activity['planType'])}><option>Principal</option><option>Alternativa</option></select></label>
        </div>
        <div className="two-cols">
          <label>Estado<select value={form.status} onChange={(event) => set('status', event.target.value as Activity['status'])}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Prioridad<select value={form.priority ?? 'Media'} onChange={(event) => set('priority', event.target.value as Activity['priority'])}><option>Baja</option><option>Media</option><option>Alta</option><option>Premium</option></select></label>
        </div>
        <label>Descripción<textarea value={form.description ?? ''} onChange={(event) => set('description', event.target.value)} /></label>
        <label>Dirección<input value={form.address ?? ''} onChange={(event) => set('address', event.target.value)} /></label>
        <details>
          <summary>Ubicación y horarios de apertura</summary>
          <div className="two-cols">
            <label>Latitud<input type="number" step="any" value={form.lat ?? ''} onChange={(event) => set('lat', event.target.value ? Number(event.target.value) : undefined)} /></label>
            <label>Longitud<input type="number" step="any" value={form.lng ?? ''} onChange={(event) => set('lng', event.target.value ? Number(event.target.value) : undefined)} /></label>
          </div>
          <WeeklyHoursEditor value={form.openingHours ?? emptyWeeklyOpeningHours()} onChange={(value) => set('openingHours', value)} />
          <label>Fechas u horarios especiales<textarea value={form.specialHours ?? ''} onChange={(event) => set('specialHours', event.target.value)} /></label>
          <label>Texto libre de horario<textarea value={form.openingHoursNote ?? ''} onChange={(event) => set('openingHoursNote', event.target.value)} /></label>
        </details>
        <details open>
          <summary>Precio y reserva</summary>
          <div className="three-cols">
            <label>Tipo<select value={form.priceDetails?.kind ?? 'Desconocido'} onChange={(event) => setPrice('kind', event.target.value as Activity['priceDetails']['kind'])}><option>Gratis</option><option>Precio fijo</option><option>Desde</option><option>Aproximado</option><option>Donativo</option><option>Desconocido</option></select></label>
            <label>Moneda<select value={form.priceDetails?.currency ?? trip.currency} onChange={(event) => setPrice('currency', event.target.value)}>{tripCurrencies(trip).map((currency) => <option key={currency}>{currency}</option>)}</select></label>
            <label>Unidad<select value={form.priceDetails?.unit ?? 'persona'} onChange={(event) => setPrice('unit', event.target.value as Activity['priceDetails']['unit'])}><option>persona</option><option>familia</option><option>actividad</option></select></label>
          </div>
          <div className="three-cols">
            <label>Adulto<input type="number" min="0" value={form.priceDetails?.adult ?? 0} onChange={(event) => setPrice('adult', Number(event.target.value))} /></label>
            <label>Niño<input type="number" min="0" value={form.priceDetails?.child ?? 0} onChange={(event) => setPrice('child', Number(event.target.value))} /></label>
            <label>Bebé<input type="number" min="0" value={form.priceDetails?.baby ?? 0} onChange={(event) => setPrice('baby', Number(event.target.value))} /></label>
            <label>Familia<input type="number" min="0" value={form.priceDetails?.family ?? 0} onChange={(event) => setPrice('family', Number(event.target.value))} /></label>
            <label>Total estimado<input type="number" min="0" value={form.priceDetails?.totalEstimate ?? 0} onChange={(event) => setPrice('totalEstimate', Number(event.target.value))} /></label>
          </div>
          <label>Nota de precio<input value={form.priceDetails?.note ?? ''} onChange={(event) => setPrice('note', event.target.value)} /></label>
          <div className="two-cols">
            <label>Reserva<select value={form.reservationStatus ?? 'No necesaria'} onChange={(event) => set('reservationStatus', event.target.value as Activity['reservationStatus'])}>{['No necesaria', 'Recomendada', 'Necesaria', 'Pendiente', 'Reservada', 'No disponible'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Referencia<input value={form.reservationReference ?? ''} onChange={(event) => set('reservationReference', event.target.value)} /></label>
          </div>
          <label>Enlace de reserva<input value={form.reservationLink ?? ''} onChange={(event) => set('reservationLink', event.target.value)} /></label>
          <div className="two-cols">
            <label>Plazo o llegada<input value={form.bookingDeadline ?? ''} onChange={(event) => set('bookingDeadline', event.target.value)} /></label>
            <label>Cancelación<input value={form.cancellationPolicy ?? ''} onChange={(event) => set('cancellationPolicy', event.target.value)} /></label>
          </div>
        </details>
        <details>
          <summary>Familia, accesibilidad y clima</summary>
          <div className="two-cols">
            <label>Entorno<select value={form.environment ?? 'Sin indicar'} onChange={(event) => set('environment', event.target.value as Activity['environment'])}><option>Interior</option><option>Exterior</option><option>Mixto</option><option>Sin indicar</option></select></label>
            <label>Edad mínima<input value={form.minimumAge ?? ''} onChange={(event) => set('minimumAge', event.target.value)} /></label>
          </div>
          <label>Accesibilidad<textarea value={form.accessibility ?? ''} onChange={(event) => set('accessibility', event.target.value)} /></label>
          <label>Plan de lluvia<textarea value={form.rainPlan ?? ''} onChange={(event) => set('rainPlan', event.target.value)} /></label>
          <div className="checkbox-grid">
            <label className="checkbox"><input type="checkbox" checked={!!form.strollerFriendly} onChange={(event) => set('strollerFriendly', event.target.checked)} /> Apto para carrito</label>
            <label className="checkbox"><input type="checkbox" checked={!!form.familyFriendly} onChange={(event) => set('familyFriendly', event.target.checked)} /> Familiar</label>
            <label className="checkbox"><input type="checkbox" checked={!!form.favorite} onChange={(event) => set('favorite', event.target.checked)} /> Favorito</label>
          </div>
        </details>
        {(form.category === 'Tour' || form.category === 'Free tour') && <details open><summary>Datos del tour</summary><div className="two-cols"><label>Proveedor<input value={form.tourProvider ?? ''} onChange={(event) => set('tourProvider', event.target.value)} /></label><label>Idioma<input value={form.tourLanguage ?? ''} onChange={(event) => set('tourLanguage', event.target.value)} /></label></div><label>Punto de encuentro<input value={form.meetingPoint ?? ''} onChange={(event) => set('meetingPoint', event.target.value)} /></label><label>Tipo de tour<input value={form.tourType ?? ''} onChange={(event) => set('tourType', event.target.value)} /></label><label>Propina<textarea value={form.tipGuidance ?? ''} onChange={(event) => set('tipGuidance', event.target.value)} /></label></details>}
        {form.category === 'Restaurante' && <details open><summary>Datos del restaurante</summary><div className="two-cols"><label>Cocina<input value={form.restaurantCuisine ?? ''} onChange={(event) => set('restaurantCuisine', event.target.value)} /></label><label>Comida<input value={form.mealType ?? ''} onChange={(event) => set('mealType', event.target.value)} /></label></div><label>Opciones alimentarias<input value={form.dietaryOptions ?? ''} onChange={(event) => set('dietaryOptions', event.target.value)} /></label><label>Plataforma de reserva<input value={form.bookingPlatform ?? ''} onChange={(event) => set('bookingPlatform', event.target.value)} /></label></details>}
        {['Ocio', 'Espectáculo', 'Experiencia'].includes(form.category ?? '') && <details open><summary>Datos de ocio</summary><div className="two-cols"><label>Tipo<input value={form.leisureType ?? ''} onChange={(event) => set('leisureType', event.target.value)} /></label><label>Sesión<input value={form.showTime ?? ''} onChange={(event) => set('showTime', event.target.value)} /></label></div><label>Recinto<input value={form.venue ?? ''} onChange={(event) => set('venue', event.target.value)} /></label></details>}
        <details>
          <summary>Fuente y verificación</summary>
          <label>Enlace oficial<input value={form.officialLink ?? ''} onChange={(event) => set('officialLink', event.target.value)} /></label>
          <div className="two-cols">
            <label>Fuente<input value={form.sourceName ?? ''} onChange={(event) => set('sourceName', event.target.value)} /></label>
            <label>URL de la fuente<input value={form.sourceUrl ?? ''} onChange={(event) => set('sourceUrl', event.target.value)} /></label>
          </div>
          <div className="two-cols">
            <label>Verificación<select value={form.verificationStatus ?? 'Pendiente de verificar'} onChange={(event) => set('verificationStatus', event.target.value as Activity['verificationStatus'])}><option>Verificado</option><option>Pendiente de verificar</option><option>Fuente no oficial</option></select></label>
            <label>Última comprobación<input type="date" value={form.lastVerifiedAt ?? ''} onChange={(event) => set('lastVerifiedAt', event.target.value)} /></label>
          </div>
          <label>Nota de verificación<textarea value={form.verificationNote ?? ''} onChange={(event) => set('verificationNote', event.target.value)} /></label>
        </details>
        <label>Notas<textarea value={form.notes ?? ''} onChange={(event) => set('notes', event.target.value)} /></label>
        <ImageInput
          onImage={async (image) => {
            setForm((current) => ({ ...current, mainImage: image.dataUrl, gallery: [...(current.gallery ?? []), image] }));
          }}
        />
        <button type="button" className="secondary photo-search-button" disabled={photoLoading} onClick={searchPhoto}>
          {photoLoading ? <LoaderCircle className="spinning" size={18} /> : <ImageIcon size={18} />}
          {photoLoading ? 'Buscando fotografía' : form.mainImage ? 'Actualizar fotografía automática' : 'Buscar fotografía automática'}
        </button>
        {form.mainImage && (
          <div className="image-editor-preview">
            <figure><img src={form.mainImage} alt="Vista previa de la actividad" /><PhotoCredit image={form.gallery?.find((image) => image.dataUrl === form.mainImage)} /></figure>
            <button className="danger-button" onClick={() => setForm((current) => ({ ...current, mainImage: '', gallery: [] }))}><Trash2 size={17} /> Eliminar fotografías</button>
          </div>
        )}
        <div className="button-row end">
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button className="primary" onClick={submit}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

function WeeklyHoursEditor({ value, onChange }: { value: Activity['openingHours']; onChange: (value: Activity['openingHours']) => void }) {
  const update = (day: keyof Activity['openingHours'], patch: Partial<Activity['openingHours'][keyof Activity['openingHours']]>) =>
    onChange({ ...value, [day]: { ...value[day], ...patch } });
  return (
    <div className="weekly-hours">
      {weekdays.map((day) => {
        const schedule = value[day];
        return (
          <div className="hours-row" key={day}>
            <strong>{day}</strong>
            <label className="checkbox"><input type="checkbox" checked={schedule.closed} onChange={(event) => update(day, { closed: event.target.checked })} /> Cerrado</label>
            <label className="checkbox"><input type="checkbox" checked={schedule.allDay} onChange={(event) => update(day, { allDay: event.target.checked })} /> 24 h</label>
            <div className="interval-list">
              {schedule.intervals.map((interval, index) => (
                <div className="interval-row" key={`${day}-${index}`}>
                  <input type="time" value={interval.open} onChange={(event) => update(day, { intervals: schedule.intervals.map((item, current) => current === index ? { ...item, open: event.target.value } : item) })} />
                  <input type="time" value={interval.close} onChange={(event) => update(day, { intervals: schedule.intervals.map((item, current) => current === index ? { ...item, close: event.target.value } : item) })} />
                  <button type="button" aria-label={`Eliminar intervalo de ${day}`} onClick={() => update(day, { intervals: schedule.intervals.filter((_, current) => current !== index) })}><Trash2 size={15} /></button>
                </div>
              ))}
              <button type="button" className="small-button" onClick={() => update(day, { intervals: [...schedule.intervals, { open: '10:00', close: '18:00' }] })}><Plus size={15} /> Intervalo</button>
            </div>
            <input value={schedule.note} onChange={(event) => update(day, { note: event.target.value })} placeholder="Nota" />
          </div>
        );
      })}
    </div>
  );
}

function AccommodationsPanel({ snapshot, refresh, notify }: ViewProps) {
  return (
    <div className="page-stack">
      <button
        className="primary"
        onClick={async () => {
          const now = new Date().toISOString();
          await putAccommodation({
            id: uuid(),
            tripId: snapshot.activeTrip.id,
            name: 'Nuevo alojamiento',
            address: '',
            phone: '',
            checkIn: '',
            checkOut: '',
            startDate: snapshot.activeTrip.startDate,
            endDate: snapshot.activeTrip.endDate,
            entryInstructions: '',
            luggageNotes: '',
            notes: '',
            images: [],
            active: snapshot.accommodations.length === 0,
            createdAt: now,
            updatedAt: now,
          });
          await refresh();
          notify('Alojamiento añadido');
        }}
      ><Plus size={18} /> Añadir alojamiento</button>
      {!snapshot.accommodations.length && <div className="info-band">Todavía no hay alojamientos en este viaje.</div>}
      {snapshot.accommodations.map((item) => (
        <EditableAccommodation key={item.id} accommodation={item} refresh={refresh} notify={notify} />
      ))}
    </div>
  );
}

function EditableAccommodation({ accommodation, refresh, notify }: { accommodation: Accommodation; refresh: () => Promise<void>; notify: (m: string) => void }) {
  const [item, setItem] = useState(accommodation);
  const [photoLoading, setPhotoLoading] = useState(false);
  useEffect(() => {
    const attemptKey = `accommodation|${accommodation.id}|${accommodation.name}|${accommodation.address}`;
    if (accommodation.images.length || !navigator.onLine || automaticPhotoAttempts.has(attemptKey) || /^nuevo alojamiento$/i.test(accommodation.name.trim())) return;
    automaticPhotoAttempts.add(attemptKey);
    let mounted = true;
    void Promise.resolve()
      .then(() => {
        if (mounted) setPhotoLoading(true);
        return findAndStorePlaceImage(accommodation.name, accommodation.address);
      })
      .then(async (image) => {
        if (!image) return;
        const saved = await addAccommodationImageIfMissing(accommodation.id, image);
        if (saved && mounted) {
          setItem((current) => current.images.length ? current : { ...current, images: [image] });
          await refresh();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setPhotoLoading(false);
      });
    return () => { mounted = false; };
  }, [accommodation.address, accommodation.id, accommodation.images.length, accommodation.name, refresh]);

  const searchPhoto = async () => {
    if (!item.name.trim() || /^nuevo alojamiento$/i.test(item.name.trim())) return notify('Escribe primero el nombre del alojamiento');
    setPhotoLoading(true);
    try {
      const image = await findAndStorePlaceImage(item.name, item.address, true);
      if (!image) return notify('No se encontró una fotografía adecuada');
      const updated = { ...item, images: [image] };
      setItem(updated);
      await putAccommodation(updated);
      await refresh();
      notify('Fotografía automática añadida');
    } catch {
      notify('No se pudo buscar la fotografía; puedes añadir una manualmente');
    } finally {
      setPhotoLoading(false);
    }
  };
  return (
    <article className="form-card">
      <h3>{item.name}</h3>
      {item.images[0] && (
        <figure className="accommodation-photo">
          <img src={item.images[0].dataUrl} alt={item.name} />
          <PhotoCredit image={item.images[0]} />
        </figure>
      )}
      {photoLoading && <div className="photo-loading" role="status"><LoaderCircle className="spinning" size={18} /> Buscando fotografía del alojamiento</div>}
      <label>Nombre<input value={item.name} onChange={(event) => setItem({ ...item, name: event.target.value })} /></label>
      <label>Dirección<input value={item.address} onChange={(event) => setItem({ ...item, address: event.target.value })} /></label>
      <div className="two-cols">
        <label>Desde<input type="date" value={item.startDate} onChange={(event) => setItem({ ...item, startDate: event.target.value })} /></label>
        <label>Hasta<input type="date" value={item.endDate} onChange={(event) => setItem({ ...item, endDate: event.target.value })} /></label>
      </div>
      <div className="two-cols">
        <label>Check-in<input value={item.checkIn} onChange={(event) => setItem({ ...item, checkIn: event.target.value })} /></label>
        <label>Check-out<input value={item.checkOut} onChange={(event) => setItem({ ...item, checkOut: event.target.value })} /></label>
      </div>
      <details>
        <summary>Ubicación exacta en el mapa</summary>
        <div className="two-cols">
          <label>Latitud<input type="number" step="any" value={item.lat ?? ''} onChange={(event) => setItem({ ...item, lat: event.target.value ? Number(event.target.value) : undefined })} /></label>
          <label>Longitud<input type="number" step="any" value={item.lng ?? ''} onChange={(event) => setItem({ ...item, lng: event.target.value ? Number(event.target.value) : undefined })} /></label>
        </div>
        <p className="muted">También puedes elegir este alojamiento en Mapa y tocar su posición exacta.</p>
      </details>
      <label>Teléfono<input type="tel" value={item.phone} onChange={(event) => setItem({ ...item, phone: event.target.value })} /></label>
      <label>Instrucciones<textarea value={item.entryInstructions} onChange={(event) => setItem({ ...item, entryInstructions: event.target.value })} /></label>
      <label>Equipaje<textarea value={item.luggageNotes} onChange={(event) => setItem({ ...item, luggageNotes: event.target.value })} /></label>
      <label>Notas<textarea value={item.notes} onChange={(event) => setItem({ ...item, notes: event.target.value })} /></label>
      <label className="checkbox"><input type="checkbox" checked={item.active} onChange={(event) => setItem({ ...item, active: event.target.checked })} /> Marcar activo</label>
      <div className="button-row">
        <ImageInput onImage={async (image) => setItem((current) => ({ ...current, images: [...current.images, image] }))} />
        <button type="button" className="secondary" disabled={photoLoading} onClick={searchPhoto}>
          {photoLoading ? <LoaderCircle className="spinning" size={18} /> : <ImageIcon size={18} />}
          {item.images.length ? 'Actualizar fotografía automática' : 'Buscar fotografía automática'}
        </button>
        {!!item.images.length && <button type="button" className="danger-button" onClick={() => setItem({ ...item, images: [] })}><Trash2 size={17} /> Eliminar fotografía</button>}
      </div>
      <div className="button-row">
        <MapButtons query={item.address} />
        <button className="primary" onClick={async () => { await putAccommodation(item); await refresh(); notify('Alojamiento guardado'); }}>Guardar</button>
        <button className="danger-button" onClick={async () => { if (confirm(`¿Eliminar el alojamiento “${item.name}”?`)) { await deleteAccommodation(item.id); await refresh(); notify('Alojamiento eliminado'); } }}><Trash2 size={18} /> Eliminar</button>
      </div>
    </article>
  );
}

function TransportPanel({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <div className="page-stack">
      <div className="info-band">Aviso local: revisad las medidas de equipaje de mano directamente en la aerolínea antes del viaje.</div>
      {snapshot.activities.filter((activity) => activity.category === 'Transporte').map((item) => (
        <article className="activity-card" key={item.id}>
          <CalendarDays size={22} />
          <div><h3>{item.title}</h3><p>{item.description}</p><p className="muted">{item.day} · {item.startTime}</p></div>
        </article>
      ))}
    </div>
  );
}

function DocumentsPanel({ snapshot, refresh, notify }: ViewProps) {
  const [title, setTitle] = useState('');
  return (
    <div className="page-stack">
      <div className="info-band">Una PWA no debe ser el único lugar para documentos esenciales. Conserva copias en correo o Archivos del iPhone.</div>
      <div className="form-card">
        <label>Título del documento<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <input aria-label="Archivo privado" type="file" accept="application/pdf,image/*" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file || !title.trim()) return notify('Añade título y archivo');
          if (file.size > 20 * 1024 * 1024) return notify('El archivo supera 20 MB');
          const dataUrl = await fileToDataUrl(file);
          await putDocument({ id: uuid(), tripId: snapshot.activeTrip.id, title, type: 'Otro', date: today, notes: '', important: false, fileName: file.name, fileType: file.type, dataUrl, createdAt: new Date().toISOString() });
          setTitle('');
          await refresh();
          notify('Documento guardado localmente');
        }} />
      </div>
      {snapshot.documents.map((doc) => (
        <article className="activity-card" key={doc.id}><FileText size={22} /><div className="activity-main"><h3>{doc.title}</h3><p>{doc.fileName}</p><div className="icon-actions labeled-actions">{doc.dataUrl && <a aria-label={`Abrir documento ${doc.title}`} href={doc.dataUrl} download={doc.fileName}><Download size={18} /><span>Abrir</span></a>}<button aria-label={`Eliminar documento ${doc.title}`} className="danger-button" onClick={async () => { if (confirm(`¿Eliminar el documento “${doc.title}”?`)) { await deleteDocument(doc.id); await refresh(); notify('Documento eliminado'); } }}><Trash2 size={18} /><span>Eliminar</span></button></div></div></article>
      ))}
    </div>
  );
}

function ExpensesPanel({ snapshot, refresh, notify }: ViewProps) {
  const trip = snapshot.activeTrip;
  const exchangeAvailable = trip.currency === trip.secondaryCurrency || Boolean(trip.exchangeRateUpdatedAt);
  const rate = exchangeAvailable ? trip.exchangeRate : Number.NaN;
  const totals = expenseTotals(snapshot.expenses, trip.currency, trip.secondaryCurrency, rate);
  const [expense, setExpense] = useState<Expense>({ id: uuid(), tripId: trip.id, concept: '', category: 'Comida', date: today, amount: 0, currency: trip.currency, paidBy: '', paymentMethod: '', notes: '' });
  return (
    <div className="page-stack">
      <section className="stats-grid">
        <div><span>Total · destino</span><strong>{formatMoney(totals.totalDestination, trip.currency)}</strong></div>
        <div><span>Total · viajero</span><strong>{exchangeAvailable ? formatMoney(totals.totalTraveller, trip.secondaryCurrency) : 'Sin cambio'}</strong></div>
        <div><span>Presupuesto</span><strong>{formatMoney(trip.budget, trip.currency)}</strong></div>
        <div><span>Diferencia</span><strong>{formatMoney(trip.budget - totals.totalDestination, trip.currency)}</strong></div>
      </section>
      {trip.exchangeRateUpdatedAt && trip.currency !== trip.secondaryCurrency && <div className="exchange-status">1 {trip.currency} = {trip.exchangeRate.toFixed(4)} {trip.secondaryCurrency}<span>Referencia {trip.exchangeRateDate} · {trip.exchangeRateSource}</span></div>}
      {!!totals.unconvertedCount && <div className="info-band">Hay {totals.unconvertedCount} gastos en una moneda distinta del par configurado. Conservan su importe original.</div>}
      <div className="form-card">
        <label>Concepto<input value={expense.concept} onChange={(event) => setExpense({ ...expense, concept: event.target.value })} /></label>
        <div className="two-cols">
          <label>Importe<input type="number" min="0" value={expense.amount} onChange={(event) => setExpense({ ...expense, amount: Number(event.target.value) })} /></label>
          <label>Moneda<select value={expense.currency} onChange={(event) => setExpense({ ...expense, currency: event.target.value })}>{tripCurrencies(trip).map((currency) => <option key={currency}>{currency}</option>)}</select></label>
        </div>
        <button className="primary" onClick={async () => { if (!expense.concept || expense.amount <= 0) return notify('Concepto e importe son obligatorios'); await putExpense({ ...expense, id: uuid() }); setExpense({ ...expense, id: uuid(), concept: '', amount: 0 }); await refresh(); notify('Gasto guardado'); }}><Euro size={18} /> Añadir gasto</button>
      </div>
      {snapshot.expenses.map((item) => {
        const target = item.currency === trip.currency ? trip.secondaryCurrency : trip.currency;
        const converted = exchangeAvailable ? convertTripCurrency(item.amount, item.currency, target, trip.currency, trip.secondaryCurrency, trip.exchangeRate) : null;
        return <article className="activity-card" key={item.id}><Euro size={22} /><div className="activity-main"><h3>{item.concept}</h3><p>{formatMoney(item.amount, item.currency)}{converted === null || target === item.currency ? '' : ` · ≈ ${formatMoney(converted, target)}`} · {item.category}</p><div className="icon-actions labeled-actions"><button aria-label={`Eliminar gasto ${item.concept}`} className="danger-button" onClick={async () => { if (confirm(`¿Eliminar el gasto “${item.concept}”?`)) { await deleteExpense(item.id); await refresh(); notify('Gasto eliminado'); } }}><Trash2 size={18} /><span>Eliminar</span></button></div></div></article>;
      })}
    </div>
  );
}

function PackingPanel({ snapshot, refresh, notify }: ViewProps) {
  const [draft, setDraft] = useState<Pick<PackingItem, 'title' | 'list' | 'person' | 'quantity' | 'notes'>>({ title: '', list: 'Equipaje', person: '', quantity: 1, notes: '' });
  const completed = snapshot.packingItems.filter((item) => item.done).length;
  const percentage = snapshot.packingItems.length ? Math.round((completed / snapshot.packingItems.length) * 100) : 0;
  const lists: PackingItem['list'][] = ['Equipaje', 'Documentación', 'Medicamentos', 'Bebé', 'Niños', 'Tecnología', 'Antes de salir', 'Durante el viaje'];
  return (
    <div className="page-stack">
      <section className="packing-progress">
        <Luggage size={26} />
        <div><span>{snapshot.packingItems.length ? `${completed} de ${snapshot.packingItems.length} preparados` : 'Tu lista está lista para empezar'}</span><div className="readiness-progress" role="progressbar" aria-label="Progreso del equipaje" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}><span style={{ width: `${percentage}%` }} /></div></div>
        <strong>{percentage}%</strong>
      </section>
      <div className="form-card">
        <label>Nuevo elemento<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Cargador, medicación, pasaportes..." /></label>
        <div className="three-cols">
          <label>Lista<select value={draft.list} onChange={(event) => setDraft({ ...draft, list: event.target.value as PackingItem['list'] })}>{lists.map((list) => <option key={list}>{list}</option>)}</select></label>
          <label>Persona<input list="travelcaris-travellers" value={draft.person} onChange={(event) => setDraft({ ...draft, person: event.target.value })} placeholder="Todos" /><datalist id="travelcaris-travellers">{snapshot.activeTrip.travellers.map((traveller) => <option key={traveller} value={traveller} />)}</datalist></label>
          <label>Cantidad<input type="number" min="1" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) || 1 })} /></label>
        </div>
        <label>Notas<input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Talla, dosis o dónde guardarlo" /></label>
        <button className="primary" onClick={async () => { if (!draft.title.trim()) return notify('Escribe el elemento que quieres añadir'); await putPackingItem({ id: uuid(), tripId: snapshot.activeTrip.id, ...draft, title: draft.title.trim(), done: false, order: snapshot.packingItems.length + 1 }); setDraft({ ...draft, title: '', notes: '', quantity: 1 }); await refresh(); notify('Elemento añadido'); }}><Plus size={18} /> Añadir a la lista</button>
      </div>
      {!snapshot.packingItems.length && <div className="info-band">Puedes separar la lista por persona y añadir preparativos como documentación, medicación o tareas antes de salir.</div>}
      {snapshot.packingItems.map((item) => (
        <div className="check-row" key={item.id}>
          <input aria-label={`Marcar ${item.title}`} type="checkbox" checked={item.done} onChange={async (event) => { await putPackingItem({ ...item, done: event.target.checked }); await refresh(); }} />
          <span><strong>{item.quantity > 1 ? `${item.quantity} × ` : ''}{item.title}</strong><small>{[item.list, item.person, item.notes].filter(Boolean).join(' · ')}</small></span>
          <button aria-label={`Eliminar ${item.title} del equipaje`} title="Eliminar" onClick={async () => { await deletePackingItem(item.id); await refresh(); notify('Elemento eliminado'); }}><Trash2 size={17} /></button>
        </div>
      ))}
    </div>
  );
}

function RemindersPanel({ snapshot, refresh, notify }: ViewProps) {
  const [draft, setDraft] = useState({ title: '', date: today, time: '09:00', notes: '' });
  const requestNotifications = async () => {
    if (!('Notification' in window)) return notify('Las notificaciones no están disponibles en este navegador');
    const result = await Notification.requestPermission();
    notify(result === 'granted' ? 'Permiso de notificaciones concedido' : 'La app seguirá funcionando sin notificaciones');
  };
  const sorted = [...snapshot.reminders].sort((left, right) => reminderTimestamp(left) - reminderTimestamp(right));
  return (
    <div className="page-stack">
      <div className="button-row"><button className="secondary" onClick={requestNotifications}><BellRing size={18} /> Activar notificaciones</button></div>
      <div className="info-band">TravelCaris avisa al abrir o mientras la PWA está activa. Añádelo también al calendario para recibir el aviso nativo con la aplicación cerrada.</div>
      <div className="form-card">
        <label>Recordatorio<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <div className="two-cols">
          <label>Fecha<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
          <label>Hora<input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></label>
        </div>
        <label>Notas<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
        <button className="primary" onClick={async () => {
          if (!draft.title.trim() || !draft.date || !draft.time) return notify('Título, fecha y hora son obligatorios');
          await putReminder({ id: uuid(), tripId: snapshot.activeTrip.id, ...draft, title: draft.title.trim(), done: false });
          setDraft({ title: '', date: draft.date, time: draft.time, notes: '' });
          await refresh();
          notify('Recordatorio programado');
        }}><CalendarPlus size={18} /> Programar recordatorio</button>
      </div>
      {!sorted.length && <div className="info-band">No hay recordatorios programados para este viaje.</div>}
      {sorted.map((item) => <EditableReminder key={item.id} reminder={item} refresh={refresh} notify={notify} />)}
    </div>
  );
}

function EditableReminder({ reminder, refresh, notify }: { reminder: Reminder; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reminder);
  const overdue = !reminder.done && Boolean(reminder.notifiedAt);
  if (editing) {
    return (
      <article className="form-card reminder-editor">
        <label>Título<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <div className="two-cols">
          <label>Fecha<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value, notifiedAt: undefined })} /></label>
          <label>Hora<input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value, notifiedAt: undefined })} /></label>
        </div>
        <label>Notas<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
        <div className="button-row end"><button onClick={() => setEditing(false)}>Cancelar</button><button className="primary" onClick={async () => { if (!draft.title.trim() || !draft.date || !draft.time) return notify('Completa título, fecha y hora'); await putReminder({ ...draft, title: draft.title.trim() }); await refresh(); setEditing(false); notify('Recordatorio actualizado'); }}>Guardar</button></div>
      </article>
    );
  }
  return (
    <article className={`reminder-row ${reminder.done ? 'done' : ''} ${overdue ? 'overdue' : ''}`}>
      <input aria-label={`Marcar ${reminder.title}`} type="checkbox" checked={reminder.done} onChange={async (event) => { await putReminder({ ...reminder, done: event.target.checked }); await refresh(); }} />
      <div><strong>{reminder.title}</strong><time dateTime={`${reminder.date}T${reminder.time}`}>{formatReminderDate(reminder.date, reminder.time)}</time>{reminder.notes && <p>{reminder.notes}</p>}</div>
      <div className="icon-actions labeled-actions">
        <button aria-label={`Editar recordatorio ${reminder.title}`} onClick={() => { setDraft(reminder); setEditing(true); }}><Edit3 size={17} /><span>Editar</span></button>
        <button aria-label={`Añadir ${reminder.title} al calendario`} onClick={() => downloadText(`recordatorio-${slugify(reminder.title)}.ics`, reminderCalendarFile(reminder), 'text/calendar;charset=utf-8')}><CalendarPlus size={17} /><span>Calendario</span></button>
        <button aria-label={`Eliminar recordatorio ${reminder.title}`} className="danger-button" onClick={async () => { if (confirm(`¿Eliminar el recordatorio “${reminder.title}”?`)) { await deleteReminder(reminder.id); await refresh(); notify('Recordatorio eliminado'); } }}><Trash2 size={17} /><span>Eliminar</span></button>
      </div>
    </article>
  );
}

function InstallPanel() {
  return (
    <section className="form-card">
      <h2>Instalar aplicación</h2>
      <ol>
        <li>Abre esta web en Safari del iPhone.</li>
        <li>Toca Compartir.</li>
        <li>Elige Añadir a pantalla de inicio.</li>
        <li>Confirma el nombre TravelCaris.</li>
      </ol>
      <p>La app se abre en modo standalone y conserva el itinerario en el dispositivo.</p>
    </section>
  );
}

function SettingsPanel({ snapshot, refresh, notify }: ViewProps) {
  const [preview, setPreview] = useState<BackupData | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const backupPrefix = `travelcaris-${slugify(snapshot.activeTrip.name)}`;
  const trip = snapshot.activeTrip;
  const availableCurrencies = [...new Set([...currencyCodes, trip.currency, trip.secondaryCurrency])];
  const updateTripCurrency = async (key: 'currency' | 'secondaryCurrency', value: string) => {
    const updated = { ...trip, [key]: value, exchangeRate: 1, exchangeRateDate: undefined, exchangeRateUpdatedAt: undefined, exchangeRateSource: undefined };
    setRateLoading(true);
    await saveTrip(updated);
    try {
      if (updated.currency !== updated.secondaryCurrency) {
        const result = await fetchLatestExchangeRate(updated.currency, updated.secondaryCurrency);
        await saveTrip({ ...updated, exchangeRate: result.rate, exchangeRateDate: result.date, exchangeRateUpdatedAt: result.fetchedAt, exchangeRateSource: result.source });
      }
    } catch {
      notify('Monedas guardadas; se actualizará el cambio cuando haya conexión');
    } finally {
      await refresh();
      setRateLoading(false);
    }
  };
  const refreshExchangeRate = async () => {
    setRateLoading(true);
    try {
      const result = await fetchLatestExchangeRate(trip.currency, trip.secondaryCurrency);
      await saveTrip({ ...trip, exchangeRate: result.rate, exchangeRateDate: result.date, exchangeRateUpdatedAt: result.fetchedAt, exchangeRateSource: result.source });
      await refresh();
      notify('Cambio actualizado');
    } catch {
      notify('No se pudo actualizar; se conserva el último cambio guardado');
    } finally {
      setRateLoading(false);
    }
  };
  const exportJson = async () => {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const file = new File([blob], `${backupPrefix}-${today}.json`, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `Copia TravelCaris · ${snapshot.activeTrip.name}` });
    else downloadBlob(blob, file.name);
  };
  return (
    <div className="page-stack">
      <div className="form-card">
        <div className="two-cols">
          <label>Moneda del destino<select value={trip.currency} onChange={(event) => updateTripCurrency('currency', event.target.value)}>{availableCurrencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
          <label>Moneda del viajero<select value={trip.secondaryCurrency} onChange={(event) => updateTripCurrency('secondaryCurrency', event.target.value)}>{availableCurrencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
        </div>
        <div className="exchange-panel">
          <div><strong>{trip.currency === trip.secondaryCurrency ? 'No hace falta conversión' : `1 ${trip.currency} = ${trip.exchangeRateUpdatedAt ? trip.exchangeRate.toFixed(4) : '—'} ${trip.secondaryCurrency}`}</strong><span>{trip.exchangeRateUpdatedAt ? `Referencia ${trip.exchangeRateDate} · ${trip.exchangeRateSource}` : 'Pendiente de obtener el último cambio publicado'}</span></div>
          <button type="button" onClick={refreshExchangeRate} disabled={rateLoading}>{rateLoading ? <LoaderCircle className="spinning" size={18} /> : <RefreshCw size={18} />} Actualizar</button>
        </div>
        <label>Presupuesto ({trip.currency})<input type="number" min="0" value={trip.budget} onChange={async (event) => { await saveTrip({ ...trip, budget: Number(event.target.value) }); await refresh(); }} /></label>
        <label>Avisar si no se verifica en (días)<input type="number" min="1" max="365" value={snapshot.settings.placeInfoStaleDays} onChange={async (event) => { await putSettings({ ...snapshot.settings, placeInfoStaleDays: Number(event.target.value) || 30 }); await refresh(); }} /></label>
        <div className="grid-actions">
          <button onClick={exportJson}><Download size={18} /> Exportar JSON</button>
          <button onClick={() => downloadText(`${backupPrefix}-itinerario.txt`, snapshot.activities.map((a) => `${a.day} ${a.startTime} - ${a.title}`).join('\n'))}>Itinerario texto</button>
          <button onClick={() => downloadText(`${backupPrefix}-gastos.csv`, expensesCsv(snapshot.expenses))}>Gastos CSV</button>
          <button onClick={() => downloadText(`${backupPrefix}-equipaje.txt`, snapshot.packingItems.map((i) => `${i.done ? '[x]' : '[ ]'} ${i.title}`).join('\n'))}>Equipaje</button>
        </div>
        <label className="file-button"><Upload size={18} /> Importar copia JSON<input type="file" accept="application/json" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 50 * 1024 * 1024) {
            notify('La copia supera el límite de 50 MB');
            event.target.value = '';
            return;
          }
          try {
            const parsed: unknown = JSON.parse(await file.text());
            if (!validateBackup(parsed)) throw new Error('Formato incorrecto');
            setPreview(parsed);
            notify('Vista previa cargada');
          } catch {
            setPreview(null);
            notify('El archivo no es una copia válida de TravelCaris');
          } finally {
            event.target.value = '';
          }
        }} /></label>
      </div>
      {preview && <div className="form-card"><h3>Vista previa</h3><p>{preview.activities.length} actividades, {preview.expenses.length} gastos.</p><button className="primary" onClick={async () => { try { await importBackup(preview, 'replace'); setPreview(null); await refresh(); notify('Copia importada'); } catch { notify('No se pudo importar la copia'); } }}>Sustituir datos</button><button className="secondary" onClick={async () => { try { await importBackup(preview, 'merge'); setPreview(null); await refresh(); notify('Copia combinada'); } catch { notify('No se pudo combinar la copia'); } }}>Combinar</button></div>}
      <div className="danger-zone">
        <div><h3>Restablecer aplicación</h3><p>Elimina todos los viajes, documentos, imágenes, gastos y ajustes guardados en este dispositivo. La aplicación volverá a su estado inicial.</p></div>
        <button className="danger-button" onClick={async () => { if (confirm('Se eliminarán definitivamente todos los datos locales de TravelCaris. Esta acción no se puede deshacer. ¿Restablecer la aplicación?')) { await restoreInitialData(); setPreview(null); await refresh(); notify('Aplicación restablecida'); } }}><RotateCcw size={18} /> Restablecer aplicación</button>
        <p>TravelCaris 3.9.0. Los datos se guardan en IndexedDB del navegador. Safari puede liberar almacenamiento si el dispositivo necesita espacio; exporta copias periódicamente.</p>
      </div>
    </div>
  );
}

function DayTabs({ selected, days, onSelect }: { selected: TripDay; days: string[]; onSelect: (day: TripDay) => void }) {
  return <div className="tabs">{days.map((day) => <button key={day} className={selected === day ? 'selected' : ''} onClick={() => onSelect(day)}>{formatDayTab(day)}</button>)}</div>;
}

function DaySelect({ value, days, onChange }: { value: TripDay; days: string[]; onChange: (day: TripDay) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value as TripDay)}>{days.map((day) => <option key={day} value={day}>{formatDate(day)}</option>)}</select>;
}

function MapButtons({ query }: { query: string }) {
  return (
    <>
      <ExternalButton href={googleMapsSearch(query)} label="Google Maps" />
      <ExternalButton href={appleMapsSearch(query)} label="Apple Maps" />
    </>
  );
}

function ExternalButton({ href, label }: { href: string; label: string }) {
  return <a className="external-button" href={href} target="_blank" rel="noreferrer"><ExternalLink size={16} /> {label}</a>;
}

function ImageInput({ onImage }: { onImage: (image: Awaited<ReturnType<typeof imageFileToStoredImage>>) => Promise<void> }) {
  const [error, setError] = useState('');
  return (
    <label className="file-button">
      Añadir fotografía
      <input type="file" accept="image/*" capture="environment" onChange={async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          await onImage(await imageFileToStoredImage(file));
          setError('');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No se pudo guardar la imagen.');
        }
      }} />
      {error && <span className="error">{error}</span>}
    </label>
  );
}

function PhotoCredit({ image }: { image?: StoredImage }) {
  if (!image?.automatic) return null;
  const author = image.author || 'Wikimedia Commons';
  const sourceUrl = image.sourceUrl ?? '';
  const licenseUrl = image.licenseUrl ?? '';
  return (
    <figcaption className="photo-credit">
      Foto: {isSafeExternalUrl(sourceUrl) ? <a href={sourceUrl} target="_blank" rel="noreferrer">{author}</a> : author}
      {image.license && <> · {isSafeExternalUrl(licenseUrl) ? <a href={licenseUrl} target="_blank" rel="noreferrer">{image.license}</a> : image.license}</>}
    </figcaption>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
}

function formatReminderDate(date: string, time: string) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(`${date}T${time}:00`));
}

function formatDayTab(value: string) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${value}T12:00:00`))
    .replace(/\.$/g, '');
}

function recommendedDeparture(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(2026, 7, 1, hours, minutes);
  date.setMinutes(date.getMinutes() - 35);
  return date.toTimeString().slice(0, 5);
}

function priceLabel(activity: Activity, trip: Trip) {
  const price = activity.priceDetails;
  if (price.kind === 'Gratis') return 'Gratis';
  if (price.kind === 'Desconocido') return 'Precio por verificar';
  const amount = price.totalEstimate || price.family || price.adult || activity.estimatedTotalPrice;
  const prefix = price.kind === 'Desde' ? 'Desde ' : price.kind === 'Aproximado' ? 'Aprox. ' : price.kind === 'Donativo' ? 'Donativo ' : '';
  if (!amount) return price.kind;
  const targetCurrency = price.currency === trip.currency ? trip.secondaryCurrency : trip.currency;
  const converted = trip.exchangeRateUpdatedAt
    ? convertTripCurrency(amount, price.currency, targetCurrency, trip.currency, trip.secondaryCurrency, trip.exchangeRate)
    : null;
  return `${prefix}${formatMoney(amount, price.currency)}${converted === null || targetCurrency === price.currency ? '' : ` · ≈ ${formatMoney(converted, targetCurrency)}`}`;
}

function tripCurrencies(trip: Trip) {
  return [...new Set([trip.currency, trip.secondaryCurrency])];
}

function isUrl(value: string) {
  return isSafeExternalUrl(value);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type }), filename);
}

function expensesCsv(expenses: Expense[]) {
  const rows = expenses.map((expense) => [expense.concept, expense.category, expense.date, expense.amount, expense.currency].map(csvCell).join(','));
  return `concepto,categoria,fecha,importe,moneda\n${rows.join('\n')}`;
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function tripDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  const current = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (current <= end && dates.length < 60) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates.length ? dates : [startDate];
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function openPdfImport() {
  try {
    sessionStorage.setItem('travelcaris-more-tab', 'Viajes');
    sessionStorage.setItem('travelcaris-open-pdf-import', 'true');
  } catch {
    // La vista Viajes sigue siendo accesible aunque el navegador bloquee el almacenamiento de sesión.
  }
}
