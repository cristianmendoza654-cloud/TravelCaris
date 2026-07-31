import {
  ExternalLink,
  Heart,
  History,
  LocateFixed,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import type { Category, ExploreContext, SearchProvider, TripDay } from '../domain/types';
import { categories, exploreContextKinds } from '../domain/types';
import { imageFileToStoredImage } from '../services/files';
import { buildProviderSearch, composeExploreQuery } from '../services/links';
import {
  clearSearchHistory,
  createActivity,
  deleteSavedPlace,
  recordSearch,
  savePlace,
  saveSearchProvider,
} from '../services/storage';
import type { AppSnapshot } from '../services/storage';

interface ExploreProps {
  snapshot: AppSnapshot;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}

const quickSearches = [
  ['Free tours', 'free tours en español'],
  ['Tours', 'tours familiares'],
  ['Comer cerca', 'restaurantes familiares económicos abiertos ahora'],
  ['Ocio', 'ocio familiar'],
  ['Con niños', 'planes con niños y carrito'],
  ['Compras', 'tiendas y compras económicas'],
  ['Lluvia', 'planes cubiertos para familias'],
  ['Emergencias', 'farmacia hospital policía emergencias'],
] as const;

const londonZones = ['Bloomsbury', 'Westminster', 'Covent Garden', 'South Bank', 'South Kensington', 'City of London', 'Greenwich', 'Victoria'];

const sessionKey = 'travelcaris-explore-context';

function initialContext(destination: string): ExploreContext {
  try {
    const stored = sessionStorage.getItem(sessionKey);
    if (stored) return JSON.parse(stored) as ExploreContext;
  } catch {
    // Session storage can be unavailable in strict privacy modes.
  }
  return { kind: 'Ciudad completa', label: `Todo ${destination}`, query: destination };
}

export function ExploreView({ snapshot, refresh, notify }: ExploreProps) {
  const [query, setQuery] = useState('restaurantes familiares económicos');
  const [context, setContextState] = useState<ExploreContext>(() => initialContext(snapshot.activeTrip.destination));
  const [address, setAddress] = useState('');
  const [zone, setZone] = useState('Westminster');
  const [activityId, setActivityId] = useState(snapshot.activities[0]?.id ?? '');
  const [showProviders, setShowProviders] = useState(false);
  const [showPlaceEditor, setShowPlaceEditor] = useState(false);

  const setContext = (next: ExploreContext) => {
    setContextState(next);
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(next));
    } catch {
      // The context remains available in memory for this visit.
    }
  };

  const fullQuery = composeExploreQuery(query, context, snapshot.activeTrip.destination);
  const enabledProviders = snapshot.searchProviders.filter((provider) => provider.enabled);
  const currentHour = new Date().getHours();
  const moment = currentHour < 12 ? 'esta mañana' : currentHour < 18 ? 'esta tarde' : 'esta noche';
  const familyHint = `${snapshot.activeTrip.travellers.length || 4} viajeros, familia, opciones económicas, ${moment}`;

  const chooseKind = (kind: ExploreContext['kind']) => {
    if (kind === 'Ciudad completa') setContext({ kind, label: `Todo ${snapshot.activeTrip.destination}`, query: snapshot.activeTrip.destination });
    if (kind === 'Alojamiento activo') {
      const accommodation = snapshot.accommodations.find((item) => item.active) ?? snapshot.accommodations[0];
      setContext({ kind, label: accommodation?.name ?? 'Alojamiento', query: accommodation?.address ?? snapshot.activeTrip.destination, lat: accommodation?.lat, lng: accommodation?.lng });
    }
    if (kind === 'Actividad del itinerario') {
      const activity = snapshot.activities.find((item) => item.id === activityId) ?? snapshot.activities[0];
      if (activity) setContext({ kind, label: activity.title, query: activity.address || activity.title, lat: activity.lat, lng: activity.lng, activityId: activity.id });
    }
    if (kind === 'Zona de Londres') setContext({ kind, label: zone, query: `${zone}, London` });
    if (kind === 'Dirección escrita') setContext({ kind, label: address || 'Dirección escrita', query: address });
    if (kind === 'Marcador del mapa') {
      const marker = readMapMarker();
      if (marker) setContext(marker);
      else notify('Selecciona primero un marcador desde Mapa');
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return notify('La ubicación no está disponible');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setContext({
          kind: 'Ubicación actual',
          label: 'Mi ubicación',
          query: `${coords.latitude},${coords.longitude}`,
          lat: coords.latitude,
          lng: coords.longitude,
        });
        notify('Ubicación activa para esta sesión');
      },
      () => notify('No se pudo obtener la ubicación'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const openProvider = async (provider: SearchProvider, requestedQuery = fullQuery) => {
    const search = buildProviderSearch(provider, requestedQuery);
    window.open(search.url, '_blank', 'noopener,noreferrer');
    if (search.copyQuery && navigator.clipboard) {
      await navigator.clipboard.writeText(requestedQuery);
      notify(`Texto copiado para buscar en ${provider.name}`);
    }
    await recordSearch({ query: requestedQuery, context, providerId: provider.id });
    await refresh();
  };

  return (
    <section className="page-stack">
      <section className="hero">
        <div>
          <h2>Explorar</h2>
          <p>{context.label}</p>
        </div>
        <button className="secondary" onClick={() => setShowProviders((value) => !value)}>
          <Settings2 size={18} /> Proveedores
        </button>
      </section>

      <section className="explore-workspace">
        <div className="search-composer">
          <label>
            Qué buscas
            <div className="input-with-icon"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Museos gratis, ramen, teatro..." /></div>
          </label>
          <label>
            Contexto
            <select value={context.kind} onChange={(event) => chooseKind(event.target.value as ExploreContext['kind'])}>
              {exploreContextKinds.filter((kind) => kind !== 'Ubicación actual').map((kind) => <option key={kind}>{kind}</option>)}
            </select>
          </label>
          {context.kind === 'Actividad del itinerario' && (
            <label>
              Actividad
              <select value={activityId} onChange={(event) => { setActivityId(event.target.value); const item = snapshot.activities.find((activity) => activity.id === event.target.value); if (item) setContext({ kind: 'Actividad del itinerario', label: item.title, query: item.address || item.title, lat: item.lat, lng: item.lng, activityId: item.id }); }}>
                {snapshot.activities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
          )}
          {context.kind === 'Dirección escrita' && (
            <label>
              Dirección
              <input value={address} onChange={(event) => setAddress(event.target.value)} onBlur={() => chooseKind('Dirección escrita')} placeholder="Dirección o punto de referencia" />
            </label>
          )}
          {context.kind === 'Zona de Londres' && (
            <label>
              Zona
              <select value={zone} onChange={(event) => { setZone(event.target.value); setContext({ kind: 'Zona de Londres', label: event.target.value, query: `${event.target.value}, London` }); }}>
                {londonZones.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          )}
          <button className="secondary location-button" onClick={useMyLocation}><LocateFixed size={18} /> Usar mi ubicación</button>
        </div>

        <div className="quick-search-grid">
          {quickSearches.map(([label, value]) => (
            <button key={label} onClick={() => setQuery(`${value}, ${familyHint}`)}>{label}</button>
          ))}
        </div>

        <div className="provider-grid">
          {enabledProviders.map((provider) => (
            <button className="provider-button" key={provider.id} onClick={() => openProvider(provider)}>
              <span>{provider.name}</span><ExternalLink size={18} />
            </button>
          ))}
        </div>
        <button className="primary add-place-button" onClick={() => setShowPlaceEditor(true)}><Plus size={18} /> Añadir lugar encontrado</button>
      </section>

      {showProviders && <ProviderSettings providers={snapshot.searchProviders} refresh={refresh} notify={notify} />}
      <ExploreLists snapshot={snapshot} refresh={refresh} notify={notify} onSearch={(value) => setQuery(value)} />
      {showPlaceEditor && <PlaceEditor snapshot={snapshot} query={query} onClose={() => setShowPlaceEditor(false)} refresh={refresh} notify={notify} />}
    </section>
  );
}

function ProviderSettings({ providers, refresh, notify }: { providers: SearchProvider[]; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [name, setName] = useState('');
  const [urlTemplate, setUrlTemplate] = useState('');
  return (
    <section className="form-card provider-settings">
      <h2>Proveedores</h2>
      {providers.map((provider) => (
        <label className="provider-setting" key={provider.id}>
          <input type="checkbox" checked={provider.enabled} onChange={async (event) => { await saveSearchProvider({ ...provider, enabled: event.target.checked }); await refresh(); }} />
          <span><strong>{provider.name}</strong><small>{provider.supportsStableSearchUrl ? 'Enlace directo' : 'Copia la búsqueda antes de abrir'}</small></span>
        </label>
      ))}
      <div className="two-cols">
        <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nuevo proveedor" /></label>
        <label>Plantilla URL<input value={urlTemplate} onChange={(event) => setUrlTemplate(event.target.value)} placeholder="https://...q={query}" /></label>
      </div>
      <button className="secondary" onClick={async () => {
        if (!name.trim() || !urlTemplate.startsWith('https://')) return notify('Indica nombre y una URL HTTPS');
        const now = new Date().toISOString();
        await saveSearchProvider({ id: uuid(), name: name.trim(), kind: 'custom', urlTemplate, enabled: true, supportsStableSearchUrl: urlTemplate.includes('{query}'), order: providers.length, createdAt: now, updatedAt: now });
        setName('');
        setUrlTemplate('');
        await refresh();
        notify('Proveedor añadido');
      }}><Plus size={18} /> Añadir proveedor</button>
    </section>
  );
}

function ExploreLists({ snapshot, refresh, notify, onSearch }: ExploreProps & { onSearch: (query: string) => void }) {
  return (
    <div className="explore-lists">
      <section>
        <div className="section-title"><h2><History size={19} /> Historial reciente</h2>{snapshot.searchHistory.length > 0 && <button className="icon-button" title="Borrar historial" aria-label="Borrar historial" onClick={async () => { await clearSearchHistory(); await refresh(); }}><Trash2 size={17} /></button>}</div>
        <div className="compact-list">
          {snapshot.searchHistory.length === 0 && <p className="muted">Sin búsquedas recientes.</p>}
          {snapshot.searchHistory.slice(0, 6).map((item) => <button key={item.id} onClick={() => onSearch(item.query)}><span>{item.query}</span><small>{item.context.label}</small></button>)}
        </div>
      </section>
      <section>
        <div className="section-title"><h2><Heart size={19} /> Lugares guardados</h2></div>
        <div className="compact-list">
          {snapshot.savedPlaces.length === 0 && <p className="muted">Sin lugares guardados.</p>}
          {snapshot.savedPlaces.map((place) => (
            <div className="saved-place-row" key={place.id}>
              <div><strong>{place.name}</strong><small>{place.category} · {place.address}</small></div>
              {place.sourceLink && <a href={place.sourceLink} target="_blank" rel="noreferrer" title="Abrir enlace"><ExternalLink size={17} /></a>}
              <button title="Eliminar" aria-label={`Eliminar ${place.name}`} onClick={async () => { await deleteSavedPlace(place.id); await refresh(); notify('Lugar eliminado'); }}><Trash2 size={17} /></button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PlaceEditor({ snapshot, query, onClose, refresh, notify }: ExploreProps & { query: string; onClose: () => void }) {
  const days = useMemo(() => tripDateRange(snapshot.activeTrip.startDate, snapshot.activeTrip.endDate), [snapshot.activeTrip]);
  const [form, setForm] = useState({
    link: '',
    name: query,
    address: '',
    category: 'Otros' as Category,
    day: snapshot.activeTrip.startDate as TripDay,
    time: '10:00',
    duration: 60,
    price: 0,
    reservationLink: '',
    notes: '',
    destination: 'favorite' as 'favorite' | 'alternative' | 'itinerary',
    image: '',
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    if (!form.name.trim()) return notify('Escribe el nombre del lugar');
    if (form.link && !/^https?:\/\//i.test(form.link)) return notify('El enlace no es válido');
    if (form.destination === 'favorite') {
      await savePlace({ name: form.name.trim(), address: form.address, category: form.category, sourceLink: form.link, image: form.image || undefined, notes: form.notes, favorite: true });
    } else {
      await createActivity({
        title: form.name.trim(),
        day: form.day,
        startTime: form.time,
        estimatedDurationMinutes: form.duration,
        category: form.category,
        address: form.address,
        mainImage: form.image || undefined,
        estimatedTotalPrice: form.price,
        officialLink: form.link,
        reservationLink: form.reservationLink,
        notes: form.notes,
        favorite: form.destination === 'alternative',
        planType: form.destination === 'alternative' ? 'Alternativa' : 'Principal',
        status: form.destination === 'alternative' ? 'Alternativa' : 'Pendiente',
        sourceName: 'Añadido manualmente desde Explorar',
        sourceUrl: form.link,
        verificationStatus: 'Pendiente de verificar',
      });
    }
    await refresh();
    notify(form.destination === 'favorite' ? 'Lugar guardado' : form.destination === 'alternative' ? 'Alternativa guardada' : 'Añadido al itinerario');
    onClose();
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Añadir lugar encontrado">
      <div className="modal">
        <h2>Añadir lugar encontrado</h2>
        <div className="segmented-control">
          {([['favorite', 'Solo favorito'], ['alternative', 'Alternativa'], ['itinerary', 'Itinerario']] as const).map(([value, label]) => <button key={value} className={form.destination === value ? 'selected' : ''} onClick={() => set('destination', value)}>{label}</button>)}
        </div>
        <label>Enlace<input value={form.link} onChange={(event) => set('link', event.target.value)} placeholder="https://..." /></label>
        <label>Nombre<input value={form.name} onChange={(event) => set('name', event.target.value)} /></label>
        <label>Dirección<input value={form.address} onChange={(event) => set('address', event.target.value)} /></label>
        <div className="two-cols">
          <label>Categoría<select value={form.category} onChange={(event) => set('category', event.target.value as Category)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Día<select value={form.day} disabled={form.destination === 'favorite'} onChange={(event) => set('day', event.target.value)}>{days.map((day) => <option key={day}>{day}</option>)}</select></label>
        </div>
        <div className="three-cols">
          <label>Hora<input type="time" value={form.time} disabled={form.destination === 'favorite'} onChange={(event) => set('time', event.target.value)} /></label>
          <label>Duración<input type="number" min="0" value={form.duration} onChange={(event) => set('duration', Number(event.target.value))} /></label>
          <label>Precio GBP<input type="number" min="0" value={form.price} onChange={(event) => set('price', Number(event.target.value))} /></label>
        </div>
        <label>Enlace de reserva<input value={form.reservationLink} onChange={(event) => set('reservationLink', event.target.value)} /></label>
        <label>Notas<textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} /></label>
        <label className="file-button">Foto<input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) set('image', (await imageFileToStoredImage(file)).dataUrl); }} /></label>
        <div className="button-row end"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" onClick={submit}>Guardar</button></div>
      </div>
    </div>
  );
}

function tripDateRange(start: string, end: string) {
  const days: string[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function readMapMarker(): ExploreContext | null {
  try {
    const value = sessionStorage.getItem('travelcaris-map-marker');
    return value ? JSON.parse(value) as ExploreContext : null;
  } catch {
    return null;
  }
}
