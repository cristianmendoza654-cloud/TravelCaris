import { Check, FileUp, LoaderCircle, MapPin, Plus, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { categories, currencyCodes, type TripStatus } from '../domain/types';
import { parseTravelPdf, validatePdfImportDraft, type PdfImportDraft } from '../services/pdfImport';
import type { AppSnapshot } from '../services/storage';
import { applyPdfImport, createTrip, deleteTrip, saveTrip, selectTrip } from '../services/storage';
import { AiItineraryPanel } from './AiItinerary';

interface TripsProps {
  snapshot: AppSnapshot;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}

export function TripsPanel({ snapshot, refresh, notify }: TripsProps) {
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAi, setShowAi] = useState(false);
  return (
    <div className="page-stack">
      <section className="form-card">
        <div className="section-heading">
          <div><p className="eyebrow">TravelCaris</p><h2>Mis viajes</h2></div>
          <div className="button-row">
            <button onClick={() => { setShowImport((value) => !value); setShowNew(false); setShowAi(false); }}><FileUp size={18} /> Importar PDF</button>
            <button onClick={() => { setShowAi((value) => !value); setShowNew(false); setShowImport(false); }}><Sparkles size={18} /> Crear con IA</button>
            <button className="primary" onClick={() => { setShowNew((value) => !value); setShowImport(false); setShowAi(false); }}><Plus size={18} /> Nuevo</button>
          </div>
        </div>
        <p className="muted">Cada viaje mantiene por separado sus vuelos, actividades, documentos y gastos.</p>
      </section>
      {showImport && <PdfImportPanel snapshot={snapshot} refresh={refresh} notify={notify} onClose={() => setShowImport(false)} />}
      {showAi && <AiItineraryPanel trip={snapshot.activeTrip} notify={notify} onClose={() => setShowAi(false)} onImport={() => { setShowAi(false); setShowImport(true); }} />}
      {showNew && <NewTripForm onCreated={async (tripId) => { await selectTrip(tripId); await refresh(); setShowNew(false); notify('Viaje creado y seleccionado'); }} />}
      <div className="trip-list">
        {snapshot.trips.map((trip) => (
          <article className={`trip-card ${trip.id === snapshot.activeTrip.id ? 'active-trip' : ''}`} key={trip.id}>
            <div>
              <p className="eyebrow">{trip.status}</p>
              <h3>{trip.name}</h3>
              <p><MapPin size={16} /> {trip.destination}{trip.country ? `, ${trip.country}` : ''}</p>
              <small>{formatDate(trip.startDate)} – {formatDate(trip.endDate)}</small>
            </div>
            <label>Estado
              <select
                value={trip.status}
                onChange={async (event) => {
                  await saveTrip({ ...trip, status: event.target.value as TripStatus });
                  await refresh();
                }}
              >
                {['Próximo', 'En curso', 'Finalizado', 'Archivado'].map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <div className="button-row">
              {trip.id === snapshot.activeTrip.id ? (
                <span className="selected-trip"><Check size={17} /> Viaje actual</span>
              ) : (
                <button
                  onClick={async () => {
                    await selectTrip(trip.id);
                    await refresh();
                    notify(`${trip.name} seleccionado`);
                  }}
                >
                  Abrir viaje
                </button>
              )}
              <button
                className="danger-button"
                onClick={async () => {
                  if (!confirm(`Se eliminarán “${trip.name}” y todos sus datos locales. ¿Continuar?`)) return;
                  await deleteTrip(trip.id);
                  await refresh();
                  notify('Viaje eliminado');
                }}
              >
                <Trash2 size={17} /> Eliminar viaje
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function PdfImportPanel({ snapshot, refresh, notify, onClose }: TripsProps & { onClose: () => void }) {
  const [draft, setDraft] = useState<PdfImportDraft | null>(null);
  const [mode, setMode] = useState<'replace' | 'new'>(
    snapshot.activities.length || snapshot.accommodations.length || snapshot.flights.length ? 'new' : 'replace',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateTrip = (key: keyof PdfImportDraft['trip'], value: string) => {
    if (draft) setDraft({ ...draft, trip: { ...draft.trip, [key]: value } });
  };

  return (
    <section className="form-card pdf-import-panel">
      <div className="section-heading">
        <div><p className="eyebrow">Importación local</p><h3>Rellenar desde un PDF</h3></div>
        <button className="icon-button" aria-label="Cerrar importación" title="Cerrar" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="privacy-note"><ShieldCheck size={20} /><p>El PDF se procesa en este dispositivo. No se sube a Vercel ni a ningún servicio externo.</p></div>
      {!draft && (
        <label className="file-button">
          {loading ? <><LoaderCircle className="spinning" size={18} /> Analizando PDF</> : <><FileUp size={18} /> Seleccionar PDF del viaje</>}
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={loading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setLoading(true);
              setError('');
              try {
                setDraft(await parseTravelPdf(file));
                notify('PDF analizado. Revisa la vista previa.');
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : 'No se pudo leer el PDF.');
              } finally {
                setLoading(false);
                event.target.value = '';
              }
            }}
          />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      {draft && (
        <>
          <div className="two-cols">
            <label>Nombre del viaje<input value={draft.trip.name} onChange={(event) => updateTrip('name', event.target.value)} /></label>
            <label>Destino<input value={draft.trip.destination} onChange={(event) => updateTrip('destination', event.target.value)} /></label>
          </div>
          <div className="three-cols">
            <label>País<input value={draft.trip.country} onChange={(event) => updateTrip('country', event.target.value)} /></label>
            <label>Inicio<input type="date" value={draft.trip.startDate} onChange={(event) => updateTrip('startDate', event.target.value)} /></label>
            <label>Fin<input type="date" min={draft.trip.startDate} value={draft.trip.endDate} onChange={(event) => updateTrip('endDate', event.target.value)} /></label>
          </div>
          <div className="import-summary" aria-label="Resumen detectado">
            <div><strong>{draft.activities.length}</strong><span>Actividades</span></div>
            <div><strong>{draft.accommodations.length}</strong><span>Alojamientos</span></div>
            <div><strong>{draft.flights.length}</strong><span>Vuelos</span></div>
          </div>
          {draft.sourceFormat === 'travelcaris-ai-v1' && <div className="notice notice-neutral"><Check size={18} /><p><strong>Formato TravelCaris IA detectado.</strong> Los bloques estructurados se han leído con prioridad.</p></div>}
          {draft.warnings.length > 0 && <div className="notice notice-warning"><div><strong>Revisión necesaria</strong>{draft.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}
          <ImportDetails draft={draft} onChange={setDraft} />
          <div className="segmented-control pdf-import-mode" aria-label="Destino de la importación">
            <button className={mode === 'replace' ? 'selected' : ''} onClick={() => setMode('replace')}>Reemplazar abierto</button>
            <button className={mode === 'new' ? 'selected' : ''} onClick={() => setMode('new')}>Crear viaje nuevo</button>
          </div>
          {mode === 'replace' && <p className="muted">Se sustituirán el itinerario, los alojamientos y los vuelos de “{snapshot.activeTrip.name}”. Los documentos, gastos y listas locales se conservarán.</p>}
          <div className="button-row end">
            <button onClick={() => { setDraft(null); setError(''); }}>Elegir otro PDF</button>
            <button
              className="primary"
              disabled={loading}
              onClick={async () => {
                const validationErrors = validatePdfImportDraft(draft);
                if (validationErrors.length) {
                  setError(validationErrors[0]);
                  return;
                }
                setLoading(true);
                setError('');
                try {
                  await applyPdfImport(draft, mode);
                  await refresh();
                  notify('Viaje rellenado desde el PDF');
                  onClose();
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : 'No se pudo guardar la importación.');
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? <LoaderCircle className="spinning" size={18} /> : <Check size={18} />} Confirmar importación
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function ImportDetails({ draft, onChange }: { draft: PdfImportDraft; onChange: (draft: PdfImportDraft) => void }) {
  const updateActivity = (index: number, patch: Partial<PdfImportDraft['activities'][number]>) => {
    onChange({ ...draft, activities: draft.activities.map((item, current) => current === index ? { ...item, ...patch } : item) });
  };
  const updateAccommodation = (index: number, patch: Partial<PdfImportDraft['accommodations'][number]>) => {
    onChange({ ...draft, accommodations: draft.accommodations.map((item, current) => current === index ? { ...item, ...patch } : item) });
  };
  const updateFlight = (index: number, patch: Partial<PdfImportDraft['flights'][number]>) => {
    onChange({ ...draft, flights: draft.flights.map((item, current) => current === index ? { ...item, ...patch } : item) });
  };

  return (
    <div className="import-details">
      <details open>
        <summary>Itinerario detectado</summary>
        {draft.activities.length ? draft.activities.map((item, index) => (
          <div className="import-edit-row" key={`${item.day}-${item.startTime}-${index}`}>
            <div className="import-activity-grid">
              <label>Fecha<input type="date" value={item.day} onChange={(event) => updateActivity(index, { day: event.target.value })} /></label>
              <label>Hora<input type="time" value={item.startTime ?? ''} onChange={(event) => updateActivity(index, { startTime: event.target.value })} /></label>
              <label>Categoría<select value={item.category ?? 'Otros'} onChange={(event) => updateActivity(index, { category: event.target.value as PdfImportDraft['activities'][number]['category'] })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label className="import-title-field">Actividad<input value={item.title} onChange={(event) => updateActivity(index, { title: event.target.value })} /></label>
              <label className="import-address-field">Dirección<input value={item.address ?? ''} onChange={(event) => updateActivity(index, { address: event.target.value })} /></label>
            </div>
            <button className="icon-button" aria-label={`Eliminar ${item.title}`} title="Eliminar" onClick={() => onChange({ ...draft, activities: draft.activities.filter((_, current) => current !== index) })}><Trash2 size={17} /></button>
          </div>
        )) : <p className="muted">Sin actividades detectadas.</p>}
      </details>
      <details>
        <summary>Alojamientos detectados</summary>
        {draft.accommodations.length ? draft.accommodations.map((item, index) => (
          <div className="import-edit-row" key={`${item.name}-${index}`}>
            <div className="import-accommodation-grid">
              <label>Alojamiento<input value={item.name} onChange={(event) => updateAccommodation(index, { name: event.target.value })} /></label>
              <label>Dirección<input value={item.address} onChange={(event) => updateAccommodation(index, { address: event.target.value })} /></label>
              <label>Desde<input type="date" value={item.startDate} onChange={(event) => updateAccommodation(index, { startDate: event.target.value })} /></label>
              <label>Hasta<input type="date" value={item.endDate} onChange={(event) => updateAccommodation(index, { endDate: event.target.value })} /></label>
            </div>
            <button className="icon-button" aria-label={`Eliminar ${item.name}`} title="Eliminar" onClick={() => onChange({ ...draft, accommodations: draft.accommodations.filter((_, current) => current !== index) })}><Trash2 size={17} /></button>
          </div>
        )) : <p className="muted">Sin alojamientos detectados.</p>}
      </details>
      <details>
        <summary>Vuelos detectados</summary>
        {draft.flights.length ? draft.flights.map((item, index) => (
          <div className="import-edit-row" key={`${item.flightNumber}-${index}`}>
            <div className="import-flight-grid">
              <label>Vuelo<input value={item.flightNumber} onChange={(event) => updateFlight(index, { flightNumber: event.target.value.toUpperCase() })} /></label>
              <label>Fecha<input type="date" value={item.scheduledDate} onChange={(event) => updateFlight(index, { scheduledDate: event.target.value })} /></label>
              <label>Salida<input type="time" value={item.scheduledDepartureTime ?? ''} onChange={(event) => updateFlight(index, { scheduledDepartureTime: event.target.value })} /></label>
              <label>Llegada<input type="time" value={item.scheduledArrivalTime ?? ''} onChange={(event) => updateFlight(index, { scheduledArrivalTime: event.target.value })} /></label>
            </div>
            <button className="icon-button" aria-label={`Eliminar vuelo ${item.flightNumber}`} title="Eliminar" onClick={() => onChange({ ...draft, flights: draft.flights.filter((_, current) => current !== index) })}><Trash2 size={17} /></button>
          </div>
        )) : <p className="muted">Sin vuelos detectados.</p>}
      </details>
    </div>
  );
}

function NewTripForm({ onCreated }: { onCreated: (tripId: string) => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ name: '', destination: '', country: '', startDate: today, endDate: today, currency: 'EUR', secondaryCurrency: 'EUR' });
  const [error, setError] = useState('');
  return (
    <section className="form-card">
      <h3>Crear viaje</h3>
      <label>Nombre<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <div className="two-cols">
        <label>Destino<input value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} /></label>
        <label>País<input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></label>
      </div>
      <div className="two-cols">
        <label>Inicio<input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
        <label>Fin<input type="date" value={form.endDate} min={form.startDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
      </div>
      <div className="two-cols">
        <label>Moneda del destino<select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>{currencyCodes.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
        <label>Moneda del viajero<select value={form.secondaryCurrency} onChange={(event) => setForm({ ...form, secondaryCurrency: event.target.value })}>{currencyCodes.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
      </div>
      {error && <p className="error">{error}</p>}
      <button
        className="primary"
        onClick={async () => {
          if (!form.name || !form.destination || !form.country || form.endDate < form.startDate) {
            setError('Completa todos los campos y revisa las fechas.');
            return;
          }
          const trip = await createTrip(form);
          await onCreated(trip.id);
        }}
      >
        Crear y abrir
      </button>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}
