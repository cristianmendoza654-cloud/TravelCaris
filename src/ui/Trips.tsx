import { Check, FileUp, LoaderCircle, MapPin, Plus, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import type { TripStatus } from '../domain/types';
import { parseTravelPdf, type PdfImportDraft } from '../services/pdfImport';
import type { AppSnapshot } from '../services/storage';
import { applyPdfImport, createTrip, saveTrip, selectTrip } from '../services/storage';

interface TripsProps {
  snapshot: AppSnapshot;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}

export function TripsPanel({ snapshot, refresh, notify }: TripsProps) {
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  return (
    <div className="page-stack">
      <section className="form-card">
        <div className="section-heading">
          <div><p className="eyebrow">TravelCaris</p><h2>Mis viajes</h2></div>
          <div className="button-row">
            <button onClick={() => { setShowImport((value) => !value); setShowNew(false); }}><FileUp size={18} /> Importar PDF</button>
            <button className="primary" onClick={() => { setShowNew((value) => !value); setShowImport(false); }}><Plus size={18} /> Nuevo</button>
          </div>
        </div>
        <p className="muted">Cada viaje mantiene por separado sus vuelos, actividades, documentos y gastos.</p>
      </section>
      {showImport && <PdfImportPanel snapshot={snapshot} refresh={refresh} notify={notify} onClose={() => setShowImport(false)} />}
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
          {draft.warnings.length > 0 && <div className="notice notice-warning"><div><strong>Revisión necesaria</strong>{draft.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}
          <ImportDetails draft={draft} />
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
                if (!draft.trip.name.trim() || !draft.trip.destination.trim() || draft.trip.endDate < draft.trip.startDate) {
                  setError('Revisa el nombre, el destino y las fechas.');
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

function ImportDetails({ draft }: { draft: PdfImportDraft }) {
  return (
    <div className="import-details">
      <details open>
        <summary>Itinerario detectado</summary>
        {draft.activities.length ? draft.activities.map((item, index) => <p key={`${item.day}-${item.startTime}-${index}`}><strong>{item.day} {item.startTime}</strong> · {item.title}</p>) : <p className="muted">Sin actividades detectadas.</p>}
      </details>
      <details>
        <summary>Alojamientos detectados</summary>
        {draft.accommodations.length ? draft.accommodations.map((item, index) => <p key={`${item.name}-${index}`}><strong>{item.name}</strong> · {item.address}</p>) : <p className="muted">Sin alojamientos detectados.</p>}
      </details>
      <details>
        <summary>Vuelos detectados</summary>
        {draft.flights.length ? draft.flights.map((item, index) => <p key={`${item.flightNumber}-${index}`}><strong>{item.flightNumber}</strong> · {item.scheduledDate} {item.scheduledDepartureTime}</p>) : <p className="muted">Sin vuelos detectados.</p>}
      </details>
    </div>
  );
}

function NewTripForm({ onCreated }: { onCreated: (tripId: string) => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ name: '', destination: '', country: '', startDate: today, endDate: today });
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
