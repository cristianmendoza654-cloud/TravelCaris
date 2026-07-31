import { Check, Edit3, FileUp, Image as ImageIcon, LoaderCircle, MapPin, Plus, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { categories, currencyCodes, type Trip, type TripStatus } from '../domain/types';
import { imageFileToStoredImage } from '../services/files';
import { parseTravelPdf, validatePdfImportDraft, type PdfImportDraft } from '../services/pdfImport';
import { findAndStorePlaceImage } from '../services/placeImages';
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
  const [showImport, setShowImport] = useState(consumePdfImportIntent);
  const [showAi, setShowAi] = useState(false);
  const [editingTripId, setEditingTripId] = useState('');
  const editingTrip = snapshot.trips.find((trip) => trip.id === editingTripId);
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
      {editingTrip && <TripEditor trip={editingTrip} refresh={refresh} notify={notify} onClose={() => setEditingTripId('')} />}
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
              <button onClick={() => setEditingTripId(trip.id)}><Edit3 size={17} /> Editar</button>
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

function TripEditor({ trip, refresh, notify, onClose }: { trip: Trip; refresh: () => Promise<void>; notify: (message: string) => void; onClose: () => void }) {
  const [form, setForm] = useState(trip);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!form.name.trim() || !form.destination.trim() || form.endDate < form.startDate) return setError('Completa el nombre, el destino y revisa las fechas.');
    const currencyChanged = form.currency !== trip.currency || form.secondaryCurrency !== trip.secondaryCurrency;
    await saveTrip({
      ...form,
      travellers: form.travellers.map((value) => value.trim()).filter(Boolean),
      exchangeRate: currencyChanged ? 1 : form.exchangeRate,
      exchangeRateDate: currencyChanged ? undefined : form.exchangeRateDate,
      exchangeRateUpdatedAt: currencyChanged ? undefined : form.exchangeRateUpdatedAt,
      exchangeRateSource: currencyChanged ? undefined : form.exchangeRateSource,
    });
    await refresh();
    notify('Perfil del viaje actualizado');
    onClose();
  };
  const automaticCover = async () => {
    if (!form.destination.trim() || form.destination === 'Destino') return setError('Escribe primero el destino.');
    setPhotoLoading(true);
    setError('');
    try {
      const image = await findAndStorePlaceImage(form.destination, form.country, true);
      if (!image) return setError('No se encontró una portada adecuada. Puedes elegir una desde tu dispositivo.');
      setForm({ ...form, coverImage: image.dataUrl, coverImageAttribution: image.attribution, coverImageSourceUrl: image.sourceUrl });
    } catch {
      setError('No se pudo buscar la portada. El resto del perfil puede guardarse igualmente.');
    } finally {
      setPhotoLoading(false);
    }
  };
  return (
    <section className="form-card trip-profile-editor">
      <div className="section-heading"><div><p className="eyebrow">Perfil del viaje</p><h3>{form.name}</h3></div><button className="icon-button" aria-label="Cerrar edición del viaje" title="Cerrar" onClick={onClose}><X size={18} /></button></div>
      {form.coverImage && <figure className="trip-cover-preview"><img src={form.coverImage} alt={`Portada de ${form.destination}`} />{form.coverImageAttribution && <figcaption>{form.coverImageSourceUrl ? <a href={form.coverImageSourceUrl} target="_blank" rel="noreferrer">{form.coverImageAttribution}</a> : form.coverImageAttribution}</figcaption>}</figure>}
      <div className="button-row">
        <label className="file-button"><ImageIcon size={18} /> Elegir portada<input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const image = await imageFileToStoredImage(file, 1600); setForm({ ...form, coverImage: image.dataUrl, coverImageAttribution: undefined, coverImageSourceUrl: undefined }); event.target.value = ''; }} /></label>
        <button type="button" onClick={automaticCover} disabled={photoLoading}>{photoLoading ? <LoaderCircle className="spinning" size={18} /> : <Sparkles size={18} />} Buscar portada</button>
        {form.coverImage && <button type="button" className="danger-button" onClick={() => setForm({ ...form, coverImage: '', coverImageAttribution: undefined, coverImageSourceUrl: undefined })}><Trash2 size={17} /> Quitar portada</button>}
      </div>
      <div className="two-cols"><label>Nombre<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Destino<input value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} /></label></div>
      <div className="three-cols"><label>País<input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></label><label>Inicio<input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label><label>Fin<input type="date" min={form.startDate} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label></div>
      <label>Descripción<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Qué hace especial este viaje" /></label>
      <label>Viajeros<input value={form.travellers.join('; ')} onChange={(event) => setForm({ ...form, travellers: event.target.value.split(';') })} placeholder="Cristian; adulto 2; niño de 8 años" /></label>
      <div className="three-cols"><label>Moneda destino<select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>{currencyCodes.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label>Moneda viajero<select value={form.secondaryCurrency} onChange={(event) => setForm({ ...form, secondaryCurrency: event.target.value })}>{currencyCodes.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label>Presupuesto ({form.currency})<input type="number" min="0" value={form.budget} onChange={(event) => setForm({ ...form, budget: Number(event.target.value) })} /></label></div>
      {error && <p className="error">{error}</p>}
      <div className="button-row end"><button onClick={onClose}>Cancelar</button><button className="primary" onClick={save}>Guardar perfil</button></div>
    </section>
  );
}

function PdfImportPanel({ snapshot, refresh, notify, onClose }: TripsProps & { onClose: () => void }) {
  const [draft, setDraft] = useState<PdfImportDraft | null>(null);
  const [mode, setMode] = useState<'replace' | 'new'>(
    snapshot.activities.length || snapshot.accommodations.length || snapshot.flights.length ? 'new' : 'replace',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateTrip = <K extends keyof PdfImportDraft['trip']>(key: K, value: PdfImportDraft['trip'][K]) => {
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
          <label>Descripción del viaje<textarea value={draft.trip.description} onChange={(event) => updateTrip('description', event.target.value)} /></label>
          <div className="three-cols">
            <label>Viajeros<input value={draft.trip.travellers.join('; ')} onChange={(event) => updateTrip('travellers', event.target.value.split(';').map((value) => value.trim()).filter(Boolean))} placeholder="2 adultos; niño de 8 años" /></label>
            <label>Moneda destino<select value={draft.trip.currency} onChange={(event) => updateTrip('currency', event.target.value)}>{currencyCodes.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
            <label>Moneda viajero<select value={draft.trip.secondaryCurrency} onChange={(event) => updateTrip('secondaryCurrency', event.target.value)}>{currencyCodes.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
          </div>
          <label>Presupuesto ({draft.trip.currency})<input type="number" min="0" value={draft.trip.budget} onChange={(event) => updateTrip('budget', Number(event.target.value))} /></label>
          <div className="import-summary" aria-label="Resumen detectado">
            <div><strong>{draft.activities.length}</strong><span>Actividades</span></div>
            <div><strong>{draft.accommodations.length}</strong><span>Alojamientos</span></div>
            <div><strong>{draft.flights.length}</strong><span>Vuelos</span></div>
            <div><strong>{draft.reminders.length}</strong><span>Recordatorios</span></div>
            <div><strong>{draft.packingItems.length}</strong><span>Equipaje</span></div>
          </div>
          {draft.sourceFormat?.startsWith('travelcaris-ai-') && <div className="notice notice-neutral"><Check size={18} /><p><strong>Formato TravelCaris IA detectado.</strong> Los bloques estructurados se han leído con prioridad.</p></div>}
          {draft.warnings.length > 0 && <div className="notice notice-warning"><div><strong>Revisión necesaria</strong>{draft.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}
          <ImportDetails draft={draft} onChange={setDraft} />
          <div className="segmented-control pdf-import-mode" aria-label="Destino de la importación">
            <button className={mode === 'replace' ? 'selected' : ''} onClick={() => setMode('replace')}>Reemplazar abierto</button>
            <button className={mode === 'new' ? 'selected' : ''} onClick={() => setMode('new')}>Crear viaje nuevo</button>
          </div>
          {mode === 'replace' && <p className="muted">Se sustituirán el itinerario, los alojamientos y los vuelos de “{snapshot.activeTrip.name}”. Los documentos y gastos se conservarán; recordatorios y equipaje del PDF se combinarán sin duplicados.</p>}
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
  const updateReminder = (index: number, patch: Partial<PdfImportDraft['reminders'][number]>) => {
    onChange({ ...draft, reminders: draft.reminders.map((item, current) => current === index ? { ...item, ...patch } : item) });
  };
  const updatePacking = (index: number, patch: Partial<PdfImportDraft['packingItems'][number]>) => {
    onChange({ ...draft, packingItems: draft.packingItems.map((item, current) => current === index ? { ...item, ...patch } : item) });
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
      <details>
        <summary>Recordatorios detectados</summary>
        {draft.reminders.length ? draft.reminders.map((item, index) => (
          <div className="import-edit-row" key={`${item.date}-${item.time}-${index}`}>
            <div className="import-flight-grid">
              <label>Recordatorio<input value={item.title} onChange={(event) => updateReminder(index, { title: event.target.value })} /></label>
              <label>Fecha<input type="date" value={item.date} onChange={(event) => updateReminder(index, { date: event.target.value })} /></label>
              <label>Hora<input type="time" value={item.time} onChange={(event) => updateReminder(index, { time: event.target.value })} /></label>
            </div>
            <button className="icon-button" aria-label={`Eliminar recordatorio ${item.title}`} title="Eliminar" onClick={() => onChange({ ...draft, reminders: draft.reminders.filter((_, current) => current !== index) })}><Trash2 size={17} /></button>
          </div>
        )) : <p className="muted">Sin recordatorios detectados.</p>}
      </details>
      <details>
        <summary>Equipaje detectado</summary>
        {draft.packingItems.length ? draft.packingItems.map((item, index) => (
          <div className="import-edit-row" key={`${item.list}-${item.title}-${index}`}>
            <div className="import-flight-grid">
              <label>Elemento<input value={item.title} onChange={(event) => updatePacking(index, { title: event.target.value })} /></label>
              <label>Lista<input value={item.list} readOnly /></label>
              <label>Persona<input value={item.person} onChange={(event) => updatePacking(index, { person: event.target.value })} /></label>
              <label>Cantidad<input type="number" min="1" value={item.quantity} onChange={(event) => updatePacking(index, { quantity: Number(event.target.value) || 1 })} /></label>
            </div>
            <button className="icon-button" aria-label={`Eliminar ${item.title} del equipaje importado`} title="Eliminar" onClick={() => onChange({ ...draft, packingItems: draft.packingItems.filter((_, current) => current !== index) })}><Trash2 size={17} /></button>
          </div>
        )) : <p className="muted">Sin elementos de equipaje detectados.</p>}
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

function consumePdfImportIntent() {
  try {
    const open = sessionStorage.getItem('travelcaris-open-pdf-import') === 'true';
    sessionStorage.removeItem('travelcaris-open-pdf-import');
    return open;
  } catch {
    return false;
  }
}
