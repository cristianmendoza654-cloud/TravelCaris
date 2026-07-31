import type {
  Accommodation,
  Activity,
  AppSettings,
  Flight,
  PackingItem,
  Reminder,
  SearchProvider,
  Transport,
  Trip,
  Weekday,
} from './types';
import { emptyWeeklyOpeningHours, richActivityDefaults } from './activity';

const now = '2026-07-31T00:00:00.000Z';
export const londonTripId = 'trip-london-2026';

export const initialTrips: Trip[] = [
  {
    id: londonTripId,
    name: 'Londres en familia 2026',
    destination: 'Londres',
    country: 'Reino Unido',
    startDate: '2026-08-01',
    endDate: '2026-08-05',
    coverImage: '/london-hero.png',
    description: 'Primer viaje familiar organizado con TravelCaris.',
    currency: 'GBP',
    secondaryCurrency: 'EUR',
    exchangeRate: 1.18,
    travellers: [],
    status: 'Próximo',
    createdAt: now,
    updatedAt: now,
  },
];

const activity = (
  order: number,
  day: Activity['day'],
  startTime: string,
  title: string,
  category: Activity['category'],
  description: string,
  address: string,
  lat?: number,
  lng?: number,
  extras: Partial<Activity> = {},
): Activity => ({
  ...richActivityDefaults(),
  id: `${day}-${order}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  tripId: londonTripId,
  title,
  description,
  date: day,
  startTime,
  endTime: extras.endTime ?? '',
  estimatedDurationMinutes: extras.estimatedDurationMinutes ?? 90,
  category,
  address,
  lat,
  lng,
  mainImage: extras.mainImage,
  gallery: [],
  adultPrice: extras.adultPrice ?? 0,
  childPrice: extras.childPrice ?? 0,
  estimatedTotalPrice: extras.estimatedTotalPrice ?? 0,
  currency: extras.currency ?? 'GBP',
  reservationRequired: extras.reservationRequired ?? false,
  reservationDone: extras.reservationDone ?? false,
  reservationReference: '',
  reservationLink: extras.reservationLink ?? '',
  officialLink: extras.officialLink ?? '',
  phone: '',
  notes: extras.notes ?? '',
  status: extras.status ?? 'Pendiente',
  priority: extras.priority ?? 'Media',
  tags: extras.tags ?? [],
  day,
  order,
  visited: false,
  favorite: extras.favorite ?? false,
  planType: extras.planType ?? (extras.status === 'Alternativa' ? 'Alternativa' : 'Principal'),
  priceDetails: {
    ...richActivityDefaults().priceDetails,
    kind: extras.estimatedTotalPrice || extras.adultPrice || extras.childPrice ? 'Aproximado' : 'Desconocido',
    adult: extras.adultPrice ?? 0,
    child: extras.childPrice ?? 0,
    totalEstimate: extras.estimatedTotalPrice ?? 0,
    currency: extras.currency ?? 'GBP',
    ...(extras.priceDetails ?? {}),
  },
  reservationStatus:
    extras.reservationStatus ??
    (extras.reservationDone ? 'Reservada' : extras.reservationRequired ? 'Necesaria' : 'No necesaria'),
  ...extras,
  createdAt: now,
  updatedAt: now,
});

const price = (
  kind: Activity['priceDetails']['kind'],
  note: string,
  values: Partial<Activity['priceDetails']> = {},
): Activity['priceDetails'] => ({
  ...richActivityDefaults().priceDetails,
  kind,
  note,
  ...values,
});

const pdfVerified = (officialSource = ''): Partial<Activity> => ({
  sourceName: officialSource ? `${officialSource} e itinerario original` : 'Itinerario original',
  verificationStatus: 'Verificado',
  lastVerifiedAt: '2026-07-31',
});

const weeklyHours = (entries: Partial<Record<Weekday, [string, string]>>): Activity['openingHours'] => {
  const schedule = emptyWeeklyOpeningHours();
  for (const [day, interval] of Object.entries(entries) as [Weekday, [string, string]][]) {
    schedule[day] = { ...schedule[day], intervals: [{ open: interval[0], close: interval[1] }] };
  }
  return schedule;
};

function alternativeActivities(): Activity[] {
  const alternative = (order: number, day: Activity['day'], title: string, category: Activity['category'], address: string, extras: Partial<Activity> = {}) =>
    activity(order, day, extras.startTime ?? '17:30', title, category, extras.description ?? 'Alternativa guardada para decidir manualmente.', address, extras.lat, extras.lng, {
      planType: 'Alternativa',
      status: 'Alternativa',
      environment: 'Interior',
      familyFriendly: true,
      sourceName: 'Itinerario original',
      verificationStatus: 'Pendiente de verificar',
      verificationNote: 'Confirmar el horario y las condiciones en la fuente oficial.',
      ...extras,
    });

  return [
    alternative(90, '2026-08-01', 'LEGO Store Leicester Square', 'Actividad infantil', 'LEGO Store Leicester Square, London', { description: 'Visita gratuita y cubierta; compras opcionales.', priceDetails: price('Gratis', 'Visita gratuita; compras opcionales.') }),
    alternative(91, '2026-08-01', 'M&M’s London', 'Actividad infantil', 'M&M’s World London', { description: 'Tienda temática cubierta junto a Leicester Square.', priceDetails: price('Gratis', 'Visita gratuita; compras opcionales.') }),
    alternative(90, '2026-08-02', 'London Eye', 'Ocio', 'London Eye, London', { startTime: '18:00', description: 'Alternativa de pago; reservar en línea y llegar 30 minutos antes.', priority: 'Premium', reservationRequired: true, reservationStatus: 'Recomendada', bookingDeadline: 'Llegar 30 minutos antes.', officialLink: 'https://www.londoneye.com/', verificationNote: 'El PDF no confirma un precio.' }),
    alternative(90, '2026-08-03', 'Primark Oxford Street', 'Tienda', 'Primark Oxford Street, London', { openingHoursNote: 'PDF: laborables y sábado aproximadamente 08:00/09:00-22:00; domingo reducido.' }),
    alternative(91, '2026-08-03', 'TK Maxx Oxford Street', 'Tienda', 'TK Maxx Oxford Street, London', { openingHours: weeklyHours({ Lunes: ['09:00', '21:30'], Martes: ['09:00', '21:30'], Miércoles: ['09:00', '21:30'], Domingo: ['12:30', '18:30'] }), openingHoursNote: 'PDF: lunes, martes y miércoles 09:00-21:30; domingo 12:30-18:30. Resto pendiente.' }),
    alternative(92, '2026-08-03', 'Uniqlo Oxford Street', 'Tienda', 'Uniqlo Oxford Street, London', { openingHoursNote: 'PDF: normalmente 10:00-21:00.' }),
    alternative(93, '2026-08-03', 'H&M Oxford Street', 'Tienda', 'H&M Oxford Street, London', { openingHoursNote: 'PDF: normalmente 10:00-21:00.' }),
    alternative(94, '2026-08-03', 'Zara Oxford Street', 'Tienda', 'Zara Oxford Street, London', { openingHoursNote: 'PDF: normalmente 10:00-21:00.' }),
    alternative(95, '2026-08-03', 'Hamleys Regent Street', 'Actividad infantil', 'Hamleys Regent Street, London', { description: 'Alternativa familiar cubierta cerca de Oxford Street.' }),
    alternative(90, '2026-08-05', 'Market Halls Victoria', 'Restaurante', 'Market Halls Victoria, London', { startTime: '12:30', description: 'Alternativa familiar para una comida temprana.', restaurantCuisine: 'Variada', mealType: 'Comida', priceDetails: price('Aproximado', 'PDF: £10-£18 por adulto.', { adult: 14 }) }),
  ];
}

export const initialActivities: Activity[] = [
  activity(1, '2026-08-01', '06:05', 'Vuelo Alicante-Londres Gatwick', 'Transporte', 'Vuelo Vueling VY8475. Llegada prevista a las 07:50.', 'Alicante Airport to London Gatwick Airport', 51.1537, -0.1821, { status: 'Confirmado', tags: ['VY8475', 'aeropuerto'] }),
  activity(2, '2026-08-01', '09:15', 'Traslado Gatwick-Londres', 'Transporte', 'Thameslink hasta St Pancras y último tramo al alojamiento.', 'Gatwick Airport to Bloomsbury, London', 51.5194, -0.1166, { estimatedTotalPrice: 38, priceDetails: price('Aproximado', 'PDF: aproximadamente £30-£45 por familia.', { totalEstimate: 38, unit: 'familia' }), ...pdfVerified() }),
  activity(3, '2026-08-01', '10:30', 'Alojamiento en Bloomsbury', 'Alojamiento', 'Desayuno y entrega de equipaje en la zona.', 'Bloomsbury, London', 51.5194, -0.1166, { status: 'Confirmado', ...pdfVerified() }),
  activity(4, '2026-08-01', '12:30', 'British Museum', 'Museo', 'Visita familiar corta: Egipto, momias y Grecia.', 'British Museum, Great Russell Street, London', 51.5194, -0.127, { endTime: '14:15', estimatedDurationMinutes: 105, reservationRequired: true, reservationStatus: 'Recomendada', strollerFriendly: true, environment: 'Interior', rainPlan: 'Alargar la visita si llueve.', officialLink: 'https://www.britishmuseum.org/visit', priceDetails: price('Gratis', 'Entrada general gratuita; reserva aconsejada.'), ...pdfVerified('British Museum') }),
  activity(5, '2026-08-01', '14:30', 'Seven Dials', 'Restaurante', 'Comida en Seven Dials Market o Pizza Pilgrims.', 'Seven Dials, London', 51.5147, -0.126, { restaurantCuisine: 'Variada / pizza', mealType: 'Comida', environment: 'Interior', priceDetails: price('Aproximado', 'PDF: £8-£15 por adulto.', { adult: 11.5 }), ...pdfVerified() }),
  activity(6, '2026-08-01', '16:00', 'Covent Garden', 'Paseo', 'Mercado, artistas callejeros, Apple Market y tiendas.', 'Covent Garden, London', 51.5117, -0.123, { environment: 'Mixto', rainPlan: 'Usar las tiendas cubiertas.', priceDetails: price('Gratis', 'Paseo gratuito; compras opcionales.'), ...pdfVerified() }),
  activity(7, '2026-08-01', '17:30', 'Leicester Square', 'Actividad infantil', 'LEGO Store, M&M’s London y ambiente familiar.', 'Leicester Square, London', 51.5107, -0.1301, { environment: 'Mixto', rainPlan: 'Entrar en las tiendas cubiertas.', priceDetails: price('Gratis', 'Visita gratuita; compras opcionales.'), ...pdfVerified() }),
  activity(8, '2026-08-01', '19:00', 'Chinatown', 'Restaurante', 'Cena temprana: dumplings, noodles o menú asiático.', 'Chinatown, London', 51.511, -0.1318, { restaurantCuisine: 'Asiática', mealType: 'Cena', priceDetails: price('Aproximado', 'PDF: £8-£15 por adulto.', { adult: 11.5 }), ...pdfVerified() }),
  activity(1, '2026-08-02', '09:30', 'Big Ben, Parlamento y Westminster Abbey', 'Monumento', 'Recorrido exterior desde Parliament Square.', 'Palace of Westminster, London', 51.4995, -0.1248, { environment: 'Exterior', priceDetails: price('Gratis', 'Visita exterior gratuita.'), ...pdfVerified() }),
  activity(2, '2026-08-02', '10:15', 'Free tour por Westminster', 'Free tour', 'Free tour en español; confirmar empresa y punto de encuentro.', 'Westminster, London', 51.5007, -0.1246, { endTime: '12:45', estimatedDurationMinutes: 150, reservationRequired: true, reservationStatus: 'Necesaria', tourLanguage: 'Español', tourType: 'A pie', tipGuidance: 'Propina familiar orientativa £20-£35.', meetingPoint: 'Pendiente de confirmar', accessibility: 'Preguntar al proveedor por el carrito.', priceDetails: price('Donativo', 'Reserva gratuita más propina voluntaria.', { unit: 'familia' }), verificationStatus: 'Pendiente de verificar', verificationNote: 'Falta confirmar proveedor, salida y accesibilidad.', sourceName: 'Itinerario original' }),
  activity(3, '2026-08-02', '12:45', 'St James’s Park', 'Parque', 'Paseo familiar junto al lago.', 'St James’s Park, London', 51.5025, -0.1348, { environment: 'Exterior', priceDetails: price('Gratis', 'Acceso gratuito.'), ...pdfVerified() }),
  activity(4, '2026-08-02', '13:30', 'Buckingham Palace', 'Monumento', 'Visita exterior.', 'Buckingham Palace, London', 51.5014, -0.1419, { environment: 'Exterior', notes: 'Comprobar el calendario oficial del cambio de guardia.', priceDetails: price('Gratis', 'Visita exterior gratuita.'), ...pdfVerified() }),
  activity(5, '2026-08-02', '14:30', 'Comida en Victoria', 'Restaurante', 'Comida económica en la zona de Victoria.', 'Victoria, London', 51.4965, -0.1439, { mealType: 'Comida', priceDetails: price('Aproximado', 'PDF: £7-£14 por adulto.', { adult: 10.5 }), ...pdfVerified() }),
  activity(6, '2026-08-02', '16:00', 'National Gallery', 'Museo', 'Visita corta de 60-75 minutos.', 'National Gallery, Trafalgar Square, London', 51.5089, -0.1283, { estimatedDurationMinutes: 75, environment: 'Interior', officialLink: 'https://www.nationalgallery.org.uk/visiting', priceDetails: price('Gratis', 'Entrada general gratuita.'), ...pdfVerified('National Gallery') }),
  activity(7, '2026-08-02', '17:30', 'South Bank', 'Paseo', 'Paseo junto al Támesis y cena por la zona.', 'South Bank, London', 51.5033, -0.1195, { environment: 'Exterior', ...pdfVerified() }),
  activity(1, '2026-08-03', '10:00', 'Natural History Museum', 'Museo', 'Entrada gratuita y prioridad familiar.', 'Natural History Museum, London', 51.4967, -0.1764, { endTime: '12:30', estimatedDurationMinutes: 150, priority: 'Alta', reservationRequired: true, reservationStatus: 'Necesaria', strollerFriendly: true, environment: 'Interior', officialLink: 'https://www.nhm.ac.uk/visit.html', priceDetails: price('Gratis', 'Entrada general gratuita.'), ...pdfVerified('Natural History Museum') }),
  activity(2, '2026-08-03', '13:30', 'Science Museum', 'Museo', 'Entrada general gratuita y actividad familiar.', 'Science Museum, London', 51.4978, -0.1745, { endTime: '15:30', estimatedDurationMinutes: 120, reservationRequired: true, reservationStatus: 'Recomendada', strollerFriendly: true, environment: 'Interior', officialLink: 'https://www.sciencemuseum.org.uk/visit', priceDetails: price('Gratis', 'Entrada general gratuita.'), ...pdfVerified('Science Museum') }),
  activity(3, '2026-08-03', '15:45', 'Hyde Park y Diana Memorial Fountain', 'Parque', 'Paseo y descanso; fuente si el tiempo acompaña.', 'Diana Memorial Fountain, London', 51.5048, -0.1717, { environment: 'Exterior', rainPlan: 'Omitir la fuente con lluvia fuerte.', openingHoursNote: 'PDF: Diana Memorial Fountain 10:00-20:00.', priceDetails: price('Gratis', 'Acceso gratuito.'), ...pdfVerified() }),
  activity(4, '2026-08-03', '17:15', 'Oxford Street', 'Tienda', 'Compras económicas; consultar las alternativas guardadas.', 'Oxford Street, London', 51.5154, -0.141, { environment: 'Mixto', ...pdfVerified() }),
  activity(1, '2026-08-04', '09:30', 'Tower of London', 'Monumento', 'Fortaleza y Joyas de la Corona.', 'Tower of London', 51.5081, -0.0759, { endTime: '12:15', estimatedDurationMinutes: 165, priority: 'Premium', reservationRequired: true, reservationStatus: 'Necesaria', estimatedTotalPrice: 95, environment: 'Mixto', officialLink: 'https://www.hrp.org.uk/tower-of-london/visit/', priceDetails: price('Aproximado', 'PDF: aproximadamente £90-£100 por familia.', { family: 95, totalEstimate: 95, unit: 'familia' }), verificationStatus: 'Pendiente de verificar', verificationNote: 'Confirmar tarifa familiar oficial.', sourceName: 'Itinerario original' }),
  activity(2, '2026-08-04', '12:15', 'Tower Bridge', 'Monumento', 'Paseo exterior y fotografías.', 'Tower Bridge, London', 51.5055, -0.0754, { environment: 'Exterior', priceDetails: price('Gratis', 'Exterior gratuito; interior opcional.'), ...pdfVerified() }),
  activity(3, '2026-08-04', '13:00', 'Borough Market', 'Mercado', 'Comida y visita.', 'Borough Market, London', 51.5054, -0.0911, { restaurantCuisine: 'Mercado gastronómico', mealType: 'Comida', environment: 'Mixto', openingHours: weeklyHours({ Martes: ['10:00', '17:00'] }), openingHoursNote: 'Martes: 10:00-17:00 según el PDF; resto pendiente.', officialLink: 'https://boroughmarket.org.uk/visit-us/', priceDetails: price('Aproximado', 'PDF: £8-£15 por adulto.', { adult: 11.5 }), ...pdfVerified('Borough Market') }),
  activity(4, '2026-08-04', '14:15', 'Southwark', 'Paseo', 'Paseo exterior por la zona histórica.', 'Southwark, London', 51.505, -0.09, { environment: 'Exterior', priceDetails: price('Gratis', 'Recorrido exterior gratuito.'), ...pdfVerified() }),
  activity(5, '2026-08-04', '15:30', 'Thames Clippers a Greenwich', 'Transporte', 'Trayecto fluvial desde London Bridge City Pier.', 'London Bridge City Pier to Greenwich Pier', 51.5077, -0.0877, { environment: 'Mixto', officialLink: 'https://www.thamesclippers.com/', verificationStatus: 'Pendiente de verificar', sourceName: 'Itinerario original' }),
  activity(6, '2026-08-04', '16:15', 'Greenwich', 'Paseo', 'Paseo por el parque y exterior del meridiano.', 'Greenwich Park, London', 51.4769, -0.0005, { environment: 'Exterior', priceDetails: price('Gratis', 'Exteriores gratuitos; entradas opcionales.'), ...pdfVerified() }),
  activity(1, '2026-08-05', '09:30', 'Belgravia, Victoria y Westminster Cathedral', 'Paseo', 'Paseo ligero adaptable al cansancio y equipaje.', 'Victoria, London', 51.4965, -0.1439, { environment: 'Exterior', priceDetails: price('Gratis', 'Recorrido exterior gratuito.'), ...pdfVerified() }),
  activity(2, '2026-08-05', '12:30', 'Comida temprana en Victoria', 'Restaurante', 'Comida familiar antes de recoger el equipaje.', 'Victoria, London', 51.4963, -0.1437, { mealType: 'Comida', priceDetails: price('Aproximado', 'PDF: £8-£15 por adulto.', { adult: 11.5 }), ...pdfVerified() }),
  activity(3, '2026-08-05', '13:45', 'Recogida de equipaje', 'Reserva', 'Recoger el equipaje antes del traslado.', 'Victoria, London', 51.4965, -0.1439, { priority: 'Alta', notes: 'Confirmar punto y horario privado.', ...pdfVerified() }),
  activity(4, '2026-08-05', '15:45', 'Traslado a Londres Luton', 'Transporte', 'Taxi hasta St Pancras, Luton Airport Express y Luton DART.', 'London St Pancras to London Luton Airport', 51.53, -0.1255, { priority: 'Alta', ...pdfVerified() }),
  activity(5, '2026-08-05', '20:00', 'Vuelo Londres Luton-Alicante', 'Transporte', 'Vuelo easyJet U22315. Llegada prevista a las 23:40.', 'London Luton Airport to Alicante Airport', 51.8747, -0.3683, { status: 'Confirmado', tags: ['U22315', 'aeropuerto'] }),
  ...alternativeActivities(),
];

export const initialAccommodations: Accommodation[] = [
  {
    id: 'accommodation-theobalds',
    tripId: londonTripId,
    name: 'Alojamiento en Bloomsbury',
    address: 'Bloomsbury, London',
    phone: '',
    checkIn: '',
    checkOut: '',
    startDate: '2026-08-01',
    endDate: '2026-08-05',
    entryInstructions: '',
    luggageNotes: '',
    notes: 'Fechas completamente editables.',
    lat: 51.5194,
    lng: -0.1166,
    images: [],
    active: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'accommodation-warwick-way',
    tripId: londonTripId,
    name: 'Alojamiento en Victoria',
    address: 'Victoria, London',
    phone: '',
    checkIn: '',
    checkOut: '',
    startDate: '2026-08-05',
    endDate: '2026-08-05',
    entryInstructions: '',
    luggageNotes: '',
    notes: 'Segundo alojamiento. Fechas editables.',
    lat: 51.4915,
    lng: -0.1443,
    images: [],
    active: false,
    createdAt: now,
    updatedAt: now,
  },
];

export const initialTransports: Transport[] = [
  { id: 'transport-vy8475', tripId: londonTripId, type: 'Vuelo', origin: 'Alicante', destination: 'Londres Gatwick', date: '2026-08-01', time: '06:05', company: 'Vueling', serviceNumber: 'VY8475', terminal: 'Gatwick terminal sur', bookingCode: '', luggage: 'Revisar medidas de equipaje de mano en la aerolínea antes de salir.', notes: '', status: 'Confirmado', reminder: 'Llegar con margen al aeropuerto.' },
  { id: 'transport-u22315', tripId: londonTripId, type: 'Vuelo', origin: 'Londres Luton', destination: 'Alicante', date: '2026-08-05', time: '20:00', company: 'easyJet', serviceNumber: 'U22315', terminal: 'Luton', bookingCode: '', luggage: 'Revisar medidas de equipaje de mano en la aerolínea antes del viaje.', notes: '', status: 'Confirmado', reminder: 'Salir de Londres entre 15:45 y 16:00.' },
];

export const initialPackingItems: PackingItem[] = [
  'Pasaportes o DNI vigentes',
  'Tarjetas sanitarias y seguro',
  'Cargadores y adaptadores UK',
  'Medicamentos habituales',
  'Ropa cómoda para lluvia',
  'Snacks para niños',
  'Copias de reservas',
].map((title, index) => ({
  id: `packing-${index + 1}`,
  tripId: londonTripId,
  list: index < 2 ? 'Documentación' : index === 3 ? 'Medicamentos' : 'Equipaje',
  title,
  done: false,
  person: '',
  quantity: 1,
  notes: '',
  order: index + 1,
}));

export const initialReminders: Reminder[] = [
  { id: 'reminder-guard', tripId: londonTripId, title: 'Comprobar cambio de guardia', date: '2026-08-02', time: '08:30', notes: 'Revisar calendario oficial.', done: false },
  { id: 'reminder-luggage', tripId: londonTripId, title: 'Recoger equipaje', date: '2026-08-05', time: '14:45', notes: 'Aviso prioritario.', done: false },
];

export const initialSettings: AppSettings = {
  id: 'settings',
  initialized: true,
  activeTripId: londonTripId,
  budgetGbp: 900,
  gbpToEur: 1.18,
  theme: 'system',
  flightProvider: 'manual',
  flightAutoUpdate: false,
  flightNotifications: false,
  flightDataSaver: true,
  flightWifiOnly: false,
  placeInfoStaleDays: 30,
};

export const initialSearchProviders: SearchProvider[] = [
  ['google-maps', 'Google Maps', 'google-maps', 'https://www.google.com/maps/search/?api=1&query={query}', true],
  ['apple-maps', 'Apple Maps', 'apple-maps', 'https://maps.apple.com/?q={query}', true],
  ['google', 'Google', 'google', 'https://www.google.com/search?q={query}', true],
  ['tripadvisor', 'Tripadvisor', 'tripadvisor', 'https://www.tripadvisor.es/Search?q={query}', true],
  ['civitatis', 'Civitatis', 'civitatis', 'https://www.google.com/search?q=site%3Acivitatis.com+{query}', false],
  ['guruwalk', 'GuruWalk', 'guruwalk', 'https://www.google.com/search?q=site%3Aguruwalk.com+{query}', false],
  ['getyourguide', 'GetYourGuide', 'getyourguide', 'https://www.google.com/search?q=site%3Agetyourguide.com+{query}', false],
  ['viator', 'Viator', 'viator', 'https://www.google.com/search?q=site%3Aviator.com+{query}', false],
  ['official', 'Web oficial', 'official', 'https://www.google.com/search?q={query}+sitio+oficial', false],
].map(([id, name, kind, urlTemplate, supportsStableSearchUrl], order) => ({
  id: String(id),
  name: String(name),
  kind: kind as SearchProvider['kind'],
  urlTemplate: String(urlTemplate),
  enabled: true,
  supportsStableSearchUrl: Boolean(supportsStableSearchUrl),
  order,
  createdAt: now,
  updatedAt: now,
}));

const flightBase = {
  tripId: londonTripId,
  estimatedDepartureTime: '',
  actualDepartureTime: '',
  estimatedArrivalTime: '',
  actualArrivalTime: '',
  departureTerminal: '',
  gate: '',
  checkInCounter: '',
  baggageBelt: '',
  delayMinutes: 0,
  aircraftType: '',
  aircraftRegistration: '',
  bookingReference: '',
  ticketNumber: '',
  includedBaggage: 'Consultar la reserva y las condiciones oficiales de la aerolínea.',
  notes: '',
  lastStatusProvider: 'Manual' as const,
  lastUpdatedAt: '',
  lastCheckedAt: '',
  lastUpdateError: '',
  autoUpdateEnabled: false,
  alertsEnabled: true,
  manualFields: {},
  automaticConflicts: {},
  createdAt: now,
  updatedAt: now,
};

export const initialFlights: Flight[] = [
  {
    ...flightBase,
    id: 'flight-vy8475-2026-08-01',
    airline: 'Vueling',
    airlineIata: 'VY',
    flightNumber: 'VY8475',
    normalizedFlightNumber: 'VY8475',
    lookupVariants: ['VY8475', 'VY 8475'],
    scheduledDate: '2026-08-01',
    departureAirport: 'Alicante-Elche Miguel Hernández',
    departureIata: 'ALC',
    arrivalAirport: 'Londres Gatwick',
    arrivalIata: 'LGW',
    scheduledDepartureTime: '06:05',
    scheduledArrivalTime: '07:50',
    arrivalTerminal: 'Sur',
    status: 'Programado',
    officialTrackingUrl: 'https://www.vueling.com/es/vueling-servicios/prepara-tu-viaje/informacion-de-vuelos/estado-de-vuelos',
    departureAirportUrl: 'https://www.aena.es/es/alicante-elche-miguel-hernandez/vuelos.html',
    arrivalAirportUrl: 'https://www.gatwickairport.com/flights/',
  },
  {
    ...flightBase,
    id: 'flight-u22315-2026-08-05',
    airline: 'easyJet',
    airlineIata: 'U2',
    flightNumber: 'U22315',
    normalizedFlightNumber: 'U22315',
    lookupVariants: ['U22315', 'U2 2315', 'EZY2315'],
    scheduledDate: '2026-08-05',
    departureAirport: 'Londres Luton',
    departureIata: 'LTN',
    arrivalAirport: 'Alicante-Elche Miguel Hernández',
    arrivalIata: 'ALC',
    scheduledDepartureTime: '20:00',
    scheduledArrivalTime: '23:40',
    arrivalTerminal: '',
    status: 'Programado',
    officialTrackingUrl: 'https://www.easyjet.com/es/flight-tracker',
    departureAirportUrl: 'https://www.london-luton.co.uk/flights',
    arrivalAirportUrl: 'https://www.aena.es/es/alicante-elche-miguel-hernandez/vuelos.html',
  },
];
