import { Check, MapPin, Plus } from 'lucide-react';
import { useState } from 'react';
import type { TripStatus } from '../domain/types';
import type { AppSnapshot } from '../services/storage';
import { createTrip, saveTrip, selectTrip } from '../services/storage';

interface TripsProps {
  snapshot: AppSnapshot;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}

export function TripsPanel({ snapshot, refresh, notify }: TripsProps) {
  const [showNew, setShowNew] = useState(false);
  return (
    <div className="page-stack">
      <section className="form-card">
        <div className="section-heading">
          <div><p className="eyebrow">TravelCaris</p><h2>Mis viajes</h2></div>
          <button className="primary" onClick={() => setShowNew((value) => !value)}><Plus size={18} /> Nuevo</button>
        </div>
        <p className="muted">Londres es el primer viaje. Cada nuevo viaje mantiene por separado sus vuelos, actividades, documentos y gastos.</p>
      </section>
      {showNew && <NewTripForm onCreated={async (tripId) => { await selectTrip(tripId); await refresh(); setShowNew(false); notify('Viaje creado y seleccionado'); }} />}
      <div className="trip-list">
        {snapshot.trips.map((trip) => (
          <article className={`trip-card ${trip.id === snapshot.activeTrip.id ? 'active-trip' : ''}`} key={trip.id}>
            <div>
              <p className="eyebrow">{trip.status}</p>
              <h3>{trip.name}</h3>
              <p><MapPin size={16} /> {trip.destination}, {trip.country}</p>
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
