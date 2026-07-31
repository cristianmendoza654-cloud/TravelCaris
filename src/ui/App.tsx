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
  CalendarDays,
  Check,
  Clock3,
  ClipboardList,
  Download,
  Edit3,
  Euro,
  ExternalLink,
  FileText,
  Home,
  Map as MapIcon,
  MoreHorizontal,
  Plane,
  Plus,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { v4 as uuid } from 'uuid';
import type {
  Accommodation,
  Activity,
  BackupData,
  Expense,
  TripDay,
} from '../domain/types';
import { categories, statuses, weekdays } from '../domain/types';
import { emptyPriceDetails, emptyWeeklyOpeningHours, isActivityStale } from '../domain/activity';
import { expenseTotals } from '../services/calculations';
import { fileToDataUrl, imageFileToStoredImage } from '../services/files';
import { findItineraryGaps } from '../services/planning';
import { appleMapsSearch, googleMapsSearch, shareText } from '../services/links';
import {
  createActivity,
  deleteActivity,
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
  const emptyTrip = !snapshot.activities.length && !snapshot.accommodations.length && !snapshot.flights.length;

  return (
    <section className="page-stack">
      <Hero title={snapshot.activeTrip.destination} subtitle={formatDate(selectedDay)} action={<DaySelect value={selectedDay} days={availableDays} onChange={setSelectedDay} />} />
      <section className="home-summary">
        <div><span>Días restantes</span><strong>{daysRemaining}</strong></div>
        <div><span>Próximo vuelo</span><strong>{nextFlight?.flightNumber ?? 'Sin vuelo'}</strong></div>
        <div><span>Alertas</span><strong>{snapshot.flightAlerts.filter((alert) => !alert.read).length}</strong></div>
      </section>
      <div className="quick-links" aria-label="Accesos rápidos">
        <NavLink to="/itinerario"><CalendarDays size={19} /> Itinerario</NavLink>
        <NavLink to="/mapa"><MapIcon size={19} /> Mapa</NavLink>
        <NavLink to="/vuelos"><Plane size={19} /> Vuelos</NavLink>
        <NavLink to="/mas"><FileText size={19} /> Documentos</NavLink>
      </div>
      {emptyTrip && (
        <section className="empty-state">
          <FileText size={28} />
          <div><h2>Empieza con tu información</h2><p>Importa el PDF del viaje o crea las actividades manualmente.</p></div>
          <NavLink className="primary" to="/mas">Importar PDF</NavLink>
        </section>
      )}
      <AlertsInbox snapshot={snapshot} refresh={refresh} notify={notify} compact />
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
          <ActivityCard key={activity.id} activity={activity} availableDays={availableDays} refresh={refresh} notify={notify} staleDays={snapshot.settings.placeInfoStaleDays} compact />
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
  const gaps = findItineraryGaps(dayActivities);

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
        title="Itinerario"
        subtitle="Arrastra, edita, duplica o mueve actividades"
        action={<button className="primary" onClick={() => setShowNew(true)}><Plus size={18} /> Crear</button>}
      />
      <DayTabs selected={selectedDay} days={availableDays} onSelect={setSelectedDay} />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={dayActivities.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <div className="timeline">
            {dayActivities.map((activity) => (
              <SortableActivity key={activity.id} activity={activity}>
                <ActivityCard activity={activity} availableDays={availableDays} refresh={refresh} notify={notify} staleDays={snapshot.settings.placeInfoStaleDays} onEdit={() => setEditing(activity)} />
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
      <section className="alternatives-section">
        <button className="section-toggle" onClick={() => setShowAlternatives((value) => !value)}>
          <span><strong>Alternativas del día</strong><small>{alternatives.length} guardadas</small></span>
          <span>{showAlternatives ? 'Ocultar' : 'Mostrar'}</span>
        </button>
        {showAlternatives && (
          <div className="timeline alternatives-list">
            {alternatives.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} availableDays={availableDays} refresh={refresh} notify={notify} staleDays={snapshot.settings.placeInfoStaleDays} onEdit={() => setEditing(activity)} />
            ))}
          </div>
        )}
      </section>
      {(editing || showNew) && (
        <ActivityEditor
          activity={editing ?? undefined}
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

function MapView({ snapshot, refresh, notify }: ViewProps) {
  const [day, setDay] = useState<'all' | TripDay>('all');
  const [category, setCategory] = useState('all');
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handler = () => setOnline(navigator.onLine);
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }, []);
  const places = snapshot.activities.filter(
    (activity) =>
      activity.lat &&
      activity.lng &&
      (day === 'all' || activity.day === day) &&
      (category === 'all' || activity.category === category),
  );
  const mapCenter: [number, number] = places.length
    ? [places.reduce((sum, place) => sum + place.lat!, 0) / places.length, places.reduce((sum, place) => sum + place.lng!, 0) / places.length]
    : worldCenter;

  return (
    <section className="page-stack">
      <Hero title="Mapa" subtitle="Ubicaciones guardadas del viaje" />
      <div className="filters">
        <select value={day} onChange={(event) => setDay(event.target.value as 'all' | TripDay)}>
          <option value="all">Todos los días</option>
          {tripDateRange(snapshot.activeTrip.startDate, snapshot.activeTrip.endDate).map((tripDay) => <option key={tripDay} value={tripDay}>{formatDate(tripDay)}</option>)}
        </select>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">Todas las categorías</option>
          {categories.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      {!online && <div className="info-band">El listado guardado funciona sin conexión. Las teselas de OpenStreetMap necesitan internet.</div>}
      <div className="map-wrap" data-testid="trip-map">
        <MapContainer key={mapCenter.join(',')} center={mapCenter} zoom={places.length ? 12 : 2} scrollWheelZoom={false} className="leaflet-map">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {places.map((activity) => (
            <Marker key={activity.id} position={[activity.lat!, activity.lng!]}>
              <Popup>
                <strong>{activity.title}</strong>
                <p>{activity.startTime} · {activity.address}</p>
                <p>{activity.notes}</p>
                <a href={googleMapsSearch(activity.address || activity.title)} target="_blank" rel="noreferrer">Google Maps</a>
                <button
                  onClick={() => {
                    sessionStorage.setItem('travelcaris-map-marker', JSON.stringify({
                      kind: 'Marcador del mapa',
                      label: activity.title,
                      query: activity.address || activity.title,
                      lat: activity.lat,
                      lng: activity.lng,
                      activityId: activity.id,
                    }));
                    notify('Marcador listo para usar en Explorar');
                  }}
                >
                  Usar en Explorar
                </button>
                <button
                  onClick={async () => {
                    await saveActivity({ ...activity, visited: true, status: 'Realizado' });
                    await refresh();
                    notify('Marcada como realizada');
                  }}
                >
                  Realizada
                </button>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <button
        className="secondary"
        onClick={() => navigator.geolocation?.getCurrentPosition(() => notify('Ubicación activada para esta sesión'), () => notify('No se pudo obtener la ubicación'))}
      >
        Usar mi ubicación
      </button>
    </section>
  );
}

function MoreView({ snapshot, refresh, notify }: ViewProps) {
  const [tab, setTab] = useState('Viajes');
  return (
    <section className="page-stack">
      <Hero title="Más" subtitle="Viajes, reservas, gastos, listas y ajustes" />
      <div className="tabs horizontal">
        {['Viajes', 'Alojamientos', 'Explorar', 'Transportes', 'Documentos', 'Gastos', 'Equipaje', 'Recordatorios', 'Vuelos', 'Instalar', 'Ajustes'].map((item) => (
          <button key={item} className={tab === item ? 'selected' : ''} onClick={() => setTab(item)}>{item}</button>
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

function Hero({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <section className="hero">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action}
    </section>
  );
}

function ActivityCard({ activity, availableDays, refresh, notify, onEdit, staleDays = 30, compact = false }: {
  activity: Activity;
  availableDays: string[];
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  onEdit?: () => void;
  staleDays?: number;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const stale = isActivityStale(activity, staleDays);
  const doShare = async () => {
    const text = shareText(activity.title, [activity.startTime, activity.address, activity.notes]);
    if (navigator.share) await navigator.share({ title: activity.title, text });
    else {
      await navigator.clipboard.writeText(text);
      notify('Copiado al portapapeles');
    }
  };
  return (
    <article className={`activity-card ${activity.visited ? 'done' : ''} ${activity.planType === 'Alternativa' ? 'alternative' : ''}`}>
      {activity.mainImage && <img className="activity-image" src={activity.mainImage} alt="" />}
      <div className={`category-dot ${activity.category.toLowerCase().replace(/\s/g, '-')}`} aria-hidden="true" />
      <div className="activity-main">
        <div className="activity-title-row">
          <span className="time">{activity.startTime}{activity.endTime ? `-${activity.endTime}` : ''}</span>
          <h3>{activity.title}</h3>
        </div>
        <p>{activity.description}</p>
        {!compact && <p className="muted">{activity.address}</p>}
        <div className="meta-row">
          <span>{activity.category}</span>
          <span>{activity.planType}</span>
          <span>{activity.estimatedDurationMinutes} min</span>
          <span>{activity.reservationStatus}</span>
          {activity.priority === 'Premium' && <span>Premium</span>}
          <span>{priceLabel(activity)}</span>
          {stale && <span className="warning-chip">Verificar datos</span>}
        </div>
        {!compact && activity.openingHoursNote && <p className="detail-line"><strong>Horario:</strong> {activity.openingHoursNote}</p>}
        {!compact && activity.rainPlan && <p className="detail-line"><strong>Lluvia:</strong> {activity.rainPlan}</p>}
        {!compact && (activity.strollerFriendly || activity.accessibility) && <p className="detail-line"><strong>Acceso:</strong> {activity.strollerFriendly ? 'Apto para carrito. ' : ''}{activity.accessibility}</p>}
        <div className="icon-actions">
          {onEdit && <button aria-label="Editar actividad" title="Editar" onClick={onEdit}><Edit3 size={18} /></button>}
          <button aria-label="Duplicar actividad" title="Duplicar" onClick={async () => { await duplicateActivity(activity); await refresh(); notify('Actividad duplicada'); }}><ClipboardList size={18} /></button>
          <button aria-label="Compartir actividad" title="Compartir" onClick={doShare}><Share2 size={18} /></button>
          <a aria-label="Abrir mapa" title="Abrir mapa" href={googleMapsSearch(activity.address || activity.title)} target="_blank" rel="noreferrer"><MapIcon size={18} /></a>
          {activity.officialLink && <a aria-label="Abrir web oficial" title="Web oficial" href={activity.officialLink} target="_blank" rel="noreferrer"><ExternalLink size={18} /></a>}
          {activity.reservationLink && <a aria-label="Abrir reserva" title="Reserva" href={activity.reservationLink} target="_blank" rel="noreferrer"><FileText size={18} /></a>}
          <button aria-label="Marcar como realizada" title="Realizada" onClick={async () => { await saveActivity({ ...activity, visited: !activity.visited, status: activity.visited ? 'Pendiente' : 'Realizado' }); await refresh(); }}><Check size={18} /></button>
          <button aria-label="Eliminar actividad" title="Eliminar" onClick={async () => { if (confirm('¿Eliminar esta actividad?')) { await deleteActivity(activity.id); await refresh(); notify('Actividad eliminada'); } }}><Trash2 size={18} /></button>
          <button aria-label="Mover a otro día" title="Cambiar día" onClick={async () => { const next = availableDays[(availableDays.indexOf(activity.day) + 1) % availableDays.length]; await moveActivity(activity.id, next); await refresh(); notify(`Movida a ${formatDate(next)}`); navigate('/itinerario'); }}><CalendarDays size={18} /></button>
        </div>
      </div>
    </article>
  );
}

function SortableActivity({ activity, children }: { activity: Activity; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: activity.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function ActivityEditor({ activity, availableDays, defaultDay, onClose, onSaved }: {
  activity?: Activity;
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
    currency: 'GBP',
    openingHours: emptyWeeklyOpeningHours(),
    priceDetails: emptyPriceDetails('GBP'),
    reservationStatus: 'No necesaria',
    verificationStatus: 'Pendiente de verificar',
    environment: 'Sin indicar',
  });
  const [error, setError] = useState('');
  const set = <K extends keyof Activity>(key: K, value: Activity[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setPrice = <K extends keyof Activity['priceDetails']>(key: K, value: Activity['priceDetails'][K]) =>
    setForm((current) => ({ ...current, priceDetails: { ...emptyPriceDetails(current.currency ?? 'GBP'), ...(current.priceDetails ?? {}), [key]: value } }));
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
      currency: form.priceDetails?.currency ?? form.currency ?? 'GBP',
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
            <label>Latitud<input type="number" step="any" value={form.lat ?? ''} onChange={(event) => set('lat', Number(event.target.value))} /></label>
            <label>Longitud<input type="number" step="any" value={form.lng ?? ''} onChange={(event) => set('lng', Number(event.target.value))} /></label>
          </div>
          <WeeklyHoursEditor value={form.openingHours ?? emptyWeeklyOpeningHours()} onChange={(value) => set('openingHours', value)} />
          <label>Fechas u horarios especiales<textarea value={form.specialHours ?? ''} onChange={(event) => set('specialHours', event.target.value)} /></label>
          <label>Texto libre de horario<textarea value={form.openingHoursNote ?? ''} onChange={(event) => set('openingHoursNote', event.target.value)} /></label>
        </details>
        <details open>
          <summary>Precio y reserva</summary>
          <div className="three-cols">
            <label>Tipo<select value={form.priceDetails?.kind ?? 'Desconocido'} onChange={(event) => setPrice('kind', event.target.value as Activity['priceDetails']['kind'])}><option>Gratis</option><option>Precio fijo</option><option>Desde</option><option>Aproximado</option><option>Donativo</option><option>Desconocido</option></select></label>
            <label>Moneda<select value={form.priceDetails?.currency ?? 'GBP'} onChange={(event) => setPrice('currency', event.target.value as 'GBP' | 'EUR')}><option>GBP</option><option>EUR</option></select></label>
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
  return (
    <article className="form-card">
      <h3>{item.name}</h3>
      <label>Dirección<input value={item.address} onChange={(event) => setItem({ ...item, address: event.target.value })} /></label>
      <div className="two-cols">
        <label>Desde<input type="date" value={item.startDate} onChange={(event) => setItem({ ...item, startDate: event.target.value })} /></label>
        <label>Hasta<input type="date" value={item.endDate} onChange={(event) => setItem({ ...item, endDate: event.target.value })} /></label>
      </div>
      <div className="two-cols">
        <label>Check-in<input value={item.checkIn} onChange={(event) => setItem({ ...item, checkIn: event.target.value })} /></label>
        <label>Check-out<input value={item.checkOut} onChange={(event) => setItem({ ...item, checkOut: event.target.value })} /></label>
      </div>
      <label>Instrucciones<textarea value={item.entryInstructions} onChange={(event) => setItem({ ...item, entryInstructions: event.target.value })} /></label>
      <label>Equipaje<textarea value={item.luggageNotes} onChange={(event) => setItem({ ...item, luggageNotes: event.target.value })} /></label>
      <label className="checkbox"><input type="checkbox" checked={item.active} onChange={(event) => setItem({ ...item, active: event.target.checked })} /> Marcar activo</label>
      <div className="button-row">
        <MapButtons query={item.address} />
        <button className="primary" onClick={async () => { await putAccommodation(item); await refresh(); notify('Alojamiento guardado'); }}>Guardar</button>
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
        <article className="activity-card" key={doc.id}><FileText size={22} /><div><h3>{doc.title}</h3><p>{doc.fileName}</p>{doc.dataUrl && <a href={doc.dataUrl} download={doc.fileName}>Abrir archivo</a>}</div></article>
      ))}
    </div>
  );
}

function ExpensesPanel({ snapshot, refresh, notify }: ViewProps) {
  const totals = expenseTotals(snapshot.expenses, snapshot.settings.gbpToEur);
  const [expense, setExpense] = useState<Expense>({ id: uuid(), tripId: snapshot.activeTrip.id, concept: '', category: 'Comida', date: today, amount: 0, currency: 'GBP', paidBy: '', paymentMethod: '', notes: '' });
  return (
    <div className="page-stack">
      <section className="stats-grid">
        <div><span>Total GBP</span><strong>£{totals.totalGbp.toFixed(2)}</strong></div>
        <div><span>Total EUR</span><strong>€{totals.totalEur.toFixed(2)}</strong></div>
        <div><span>Presupuesto</span><strong>£{snapshot.settings.budgetGbp}</strong></div>
        <div><span>Diferencia</span><strong>£{(snapshot.settings.budgetGbp - totals.totalGbp).toFixed(2)}</strong></div>
      </section>
      <div className="form-card">
        <label>Concepto<input value={expense.concept} onChange={(event) => setExpense({ ...expense, concept: event.target.value })} /></label>
        <div className="two-cols">
          <label>Importe<input type="number" min="0" value={expense.amount} onChange={(event) => setExpense({ ...expense, amount: Number(event.target.value) })} /></label>
          <label>Moneda<select value={expense.currency} onChange={(event) => setExpense({ ...expense, currency: event.target.value as 'GBP' | 'EUR' })}><option>GBP</option><option>EUR</option></select></label>
        </div>
        <button className="primary" onClick={async () => { if (!expense.concept || expense.amount <= 0) return notify('Concepto e importe son obligatorios'); await putExpense({ ...expense, id: uuid() }); await refresh(); notify('Gasto guardado'); }}><Euro size={18} /> Añadir gasto</button>
      </div>
      {snapshot.expenses.map((item) => <article className="activity-card" key={item.id}><Euro size={22} /><div><h3>{item.concept}</h3><p>{item.amount} {item.currency} · {item.category}</p></div></article>)}
    </div>
  );
}

function PackingPanel({ snapshot, refresh, notify }: ViewProps) {
  const [title, setTitle] = useState('');
  return (
    <div className="page-stack">
      <div className="form-card">
        <label>Nuevo elemento<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <button className="primary" onClick={async () => { if (!title.trim()) return; await putPackingItem({ id: uuid(), tripId: snapshot.activeTrip.id, list: 'Equipaje', title, done: false, person: '', quantity: 1, notes: '', order: snapshot.packingItems.length + 1 }); setTitle(''); await refresh(); notify('Elemento añadido'); }}><Plus size={18} /> Añadir</button>
      </div>
      {snapshot.packingItems.map((item) => (
        <label className="check-row" key={item.id}>
          <input type="checkbox" checked={item.done} onChange={async (event) => { await putPackingItem({ ...item, done: event.target.checked }); await refresh(); }} />
          <span>{item.title}</span>
          <small>{item.list}</small>
        </label>
      ))}
    </div>
  );
}

function RemindersPanel({ snapshot, refresh, notify }: ViewProps) {
  const [title, setTitle] = useState('');
  const requestNotifications = async () => {
    if (!('Notification' in window)) return notify('Las notificaciones no están disponibles en este navegador');
    const result = await Notification.requestPermission();
    notify(result === 'granted' ? 'Permiso de notificaciones concedido' : 'La app seguirá funcionando sin notificaciones');
  };
  return (
    <div className="page-stack">
      <button className="secondary" onClick={requestNotifications}>Activar notificaciones</button>
      <div className="form-card">
        <label>Recordatorio<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <button className="primary" onClick={async () => { if (!title) return; await putReminder({ id: uuid(), tripId: snapshot.activeTrip.id, title, date: today, time: '09:00', notes: '', done: false }); setTitle(''); await refresh(); }}>Añadir</button>
      </div>
      {snapshot.reminders.map((item) => <label className="check-row" key={item.id}><input type="checkbox" checked={item.done} onChange={async (event) => { await putReminder({ ...item, done: event.target.checked }); await refresh(); }} /><span>{item.title}</span><small>{item.date} {item.time}</small></label>)}
    </div>
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
  const backupPrefix = `travelcaris-${slugify(snapshot.activeTrip.name)}`;
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
        <label>Presupuesto GBP<input type="number" value={snapshot.settings.budgetGbp} onChange={async (event) => { await putSettings({ ...snapshot.settings, budgetGbp: Number(event.target.value) }); await refresh(); }} /></label>
        <label>Cambio GBP a EUR<input type="number" step="0.01" value={snapshot.settings.gbpToEur} onChange={async (event) => { await putSettings({ ...snapshot.settings, gbpToEur: Number(event.target.value) }); await refresh(); }} /></label>
        <label>Avisar si no se verifica en (días)<input type="number" min="1" max="365" value={snapshot.settings.placeInfoStaleDays} onChange={async (event) => { await putSettings({ ...snapshot.settings, placeInfoStaleDays: Number(event.target.value) || 30 }); await refresh(); }} /></label>
        <div className="grid-actions">
          <button onClick={exportJson}><Download size={18} /> Exportar JSON</button>
          <button onClick={() => downloadText(`${backupPrefix}-itinerario.txt`, snapshot.activities.map((a) => `${a.day} ${a.startTime} - ${a.title}`).join('\n'))}>Itinerario texto</button>
          <button onClick={() => downloadText(`${backupPrefix}-gastos.csv`, `concepto,categoria,fecha,importe,moneda\n${snapshot.expenses.map((e) => `${e.concept},${e.category},${e.date},${e.amount},${e.currency}`).join('\n')}`)}>Gastos CSV</button>
          <button onClick={() => downloadText(`${backupPrefix}-equipaje.txt`, snapshot.packingItems.map((i) => `${i.done ? '[x]' : '[ ]'} ${i.title}`).join('\n'))}>Equipaje</button>
        </div>
        <label className="file-button"><Upload size={18} /> Importar copia JSON<input type="file" accept="application/json" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            setPreview(JSON.parse(await file.text()) as BackupData);
            notify('Vista previa cargada');
          } catch {
            notify('El JSON no es válido');
          }
        }} /></label>
      </div>
      {preview && <div className="form-card"><h3>Vista previa</h3><p>{preview.activities?.length ?? 0} actividades, {preview.expenses?.length ?? 0} gastos.</p><button className="primary" onClick={async () => { await importBackup(preview, 'replace'); setPreview(null); await refresh(); notify('Copia importada'); }}>Sustituir datos</button><button className="secondary" onClick={async () => { await importBackup(preview, 'merge'); setPreview(null); await refresh(); notify('Copia combinada'); }}>Combinar</button></div>}
      <div className="danger-zone">
        <button onClick={async () => { if (confirm('¿Vaciar todos los datos locales y volver al inicio?')) { await restoreInitialData(); await refresh(); notify('Datos locales vaciados'); } }}>Vaciar datos locales</button>
        <p>TravelCaris 3.1. Los datos se guardan en IndexedDB del navegador. Safari puede liberar almacenamiento si el dispositivo necesita espacio; exporta copias periódicamente.</p>
      </div>
    </div>
  );
}

function DayTabs({ selected, days, onSelect }: { selected: TripDay; days: string[]; onSelect: (day: TripDay) => void }) {
  return <div className="tabs">{days.map((day) => <button key={day} className={selected === day ? 'selected' : ''} onClick={() => onSelect(day)}>{day.slice(8)} ago</button>)}</div>;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
}

function recommendedDeparture(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(2026, 7, 1, hours, minutes);
  date.setMinutes(date.getMinutes() - 35);
  return date.toTimeString().slice(0, 5);
}

function priceLabel(activity: Activity) {
  const price = activity.priceDetails;
  if (price.kind === 'Gratis') return 'Gratis';
  if (price.kind === 'Desconocido') return 'Precio por verificar';
  const amount = price.totalEstimate || price.family || price.adult || activity.estimatedTotalPrice;
  const prefix = price.kind === 'Desde' ? 'Desde ' : price.kind === 'Aproximado' ? 'Aprox. ' : price.kind === 'Donativo' ? 'Donativo ' : '';
  return amount ? `${prefix}${amount} ${price.currency}` : price.kind;
}

function isUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, text: string) {
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);
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
