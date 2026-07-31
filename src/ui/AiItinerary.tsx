import { Copy, ExternalLink, FileUp, ShieldCheck, Sparkles, WandSparkles, X } from 'lucide-react';
import { useState } from 'react';
import { currencyCodes, type Trip } from '../domain/types';
import { buildAiItineraryPrompt, type AiItineraryBrief } from '../services/aiItinerary';

interface AiItineraryPanelProps {
  trip: Trip;
  notify: (message: string) => void;
  onClose: () => void;
  onImport: () => void;
}

export function AiItineraryPanel({ trip, notify, onClose, onImport }: AiItineraryPanelProps) {
  const [brief, setBrief] = useState<AiItineraryBrief>({
    destination: trip.destination === 'Destino' ? '' : trip.destination,
    country: trip.country,
    startDate: trip.startDate,
    endDate: trip.endDate,
    travellers: trip.travellers.join(', '),
    budget: trip.budget ? `${trip.budget} ${trip.currency}` : '',
    destinationCurrency: trip.currency,
    travellerCurrency: trip.secondaryCurrency,
    pace: 'Equilibrado',
    interests: '',
    accommodation: '',
    transport: '',
    accessibility: '',
    food: '',
    preparations: '',
    packing: '',
    notes: trip.description,
  });
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');

  const update = <K extends keyof AiItineraryBrief>(key: K, value: AiItineraryBrief[K]) => {
    setBrief((current) => ({ ...current, [key]: value }));
    setPrompt('');
    setError('');
  };

  const prepare = () => {
    if (!brief.destination.trim() && !brief.notes.trim()) {
      setError('Indica al menos el destino o qué tipo de viaje quieres hacer.');
      return;
    }
    if (brief.startDate && brief.endDate && brief.endDate < brief.startDate) {
      setError('La fecha final no puede ser anterior a la inicial.');
      return;
    }
    setPrompt(buildAiItineraryPrompt(brief));
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      notify('Instrucciones copiadas');
    } catch {
      setError('No se pudo copiar automáticamente. Mantén pulsado el texto para copiarlo.');
    }
  };

  return (
    <section className="form-card ai-itinerary-panel">
      <div className="section-heading">
        <div><p className="eyebrow">Planificación asistida</p><h3><Sparkles size={20} /> Crear itinerario con IA</h3></div>
        <button className="icon-button" aria-label="Cerrar creador con IA" title="Cerrar" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="privacy-note"><ShieldCheck size={20} /><p>No incluyas localizadores, documentos, billetes ni datos bancarios. TravelCaris no envía este formulario a ningún servicio.</p></div>
      <div className="three-cols">
        <label>Destino<input value={brief.destination} onChange={(event) => update('destination', event.target.value)} placeholder="Ciudad, país o ruta" /></label>
        <label>País<input value={brief.country} onChange={(event) => update('country', event.target.value)} /></label>
        <label>Viajeros<input value={brief.travellers} onChange={(event) => update('travellers', event.target.value)} placeholder="Edades y número de personas" /></label>
      </div>
      <div className="three-cols">
        <label>Inicio<input type="date" value={brief.startDate} onChange={(event) => update('startDate', event.target.value)} /></label>
        <label>Fin<input type="date" min={brief.startDate} value={brief.endDate} onChange={(event) => update('endDate', event.target.value)} /></label>
        <label>Ritmo<select value={brief.pace} onChange={(event) => update('pace', event.target.value as AiItineraryBrief['pace'])}><option>Tranquilo</option><option>Equilibrado</option><option>Intenso</option></select></label>
      </div>
      <div className="two-cols">
        <label>Presupuesto<input value={brief.budget} onChange={(event) => update('budget', event.target.value)} placeholder="Total, moneda y qué incluye" /></label>
        <label>Intereses<input value={brief.interests} onChange={(event) => update('interests', event.target.value)} placeholder="Cultura, gastronomía, ocio..." /></label>
      </div>
      <div className="two-cols">
        <label>Moneda del destino<select value={brief.destinationCurrency} onChange={(event) => update('destinationCurrency', event.target.value)}>{currencyCodes.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
        <label>Moneda del viajero<select value={brief.travellerCurrency} onChange={(event) => update('travellerCurrency', event.target.value)}>{currencyCodes.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
      </div>
      <div className="two-cols">
        <label>Alojamiento o zona<input value={brief.accommodation} onChange={(event) => update('accommodation', event.target.value)} /></label>
        <label>Transporte previsto<input value={brief.transport} onChange={(event) => update('transport', event.target.value)} placeholder="Vuelos, tren, coche..." /></label>
      </div>
      <div className="two-cols">
        <label>Movilidad y accesibilidad<input value={brief.accessibility} onChange={(event) => update('accessibility', event.target.value)} /></label>
        <label>Alimentación<input value={brief.food} onChange={(event) => update('food', event.target.value)} placeholder="Alergias, preferencias..." /></label>
      </div>
      <div className="two-cols">
        <label>Preparativos y fechas<input value={brief.preparations} onChange={(event) => update('preparations', event.target.value)} placeholder="Reservas, visados, check-in..." /></label>
        <label>Equipaje especial<input value={brief.packing} onChange={(event) => update('packing', event.target.value)} placeholder="Medicamentos, bebé, tecnología..." /></label>
      </div>
      <label>Qué quieres hacer en este viaje<textarea value={brief.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Prioridades, planes imprescindibles, horarios, cosas que quieres evitar y cualquier petición especial" /></label>
      {error && <p className="error">{error}</p>}
      {!prompt ? (
        <button className="primary ai-prepare-button" onClick={prepare}><WandSparkles size={18} /> Preparar instrucciones para ChatGPT</button>
      ) : (
        <div className="ai-prompt-result">
          <label>Encargo preparado<textarea className="ai-prompt-preview" readOnly value={prompt} rows={12} /></label>
          <div className="button-row">
            <button className="primary" onClick={copyPrompt}><Copy size={18} /> Copiar instrucciones</button>
            <a className="external-button" href="https://chatgpt.com/" target="_blank" rel="noreferrer"><ExternalLink size={18} /> Abrir ChatGPT</a>
            <button onClick={onImport}><FileUp size={18} /> Ya tengo el PDF</button>
          </div>
        </div>
      )}
    </section>
  );
}
