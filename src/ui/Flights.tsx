/* eslint-disable react-refresh/only-export-components */
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  Info,
  Plane,
  Plus,
  RefreshCw,
  ShieldAlert,
  WifiOff,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Flight, FlightStatus, FlightStatusResult } from '../domain/types';
import { flightStatuses } from '../domain/types';
import {
  getFlightProviderDiagnostic,
  InternalApiFlightStatusProvider,
  isFlightDataStale,
  providerLabel,
  recommendedRefreshInterval,
} from '../services/flightStatus';
import { isSafeExternalUrl } from '../services/links';
import {
  applyFlightStatusResult,
  clearFlightStatusCache,
  createFlight,
  markAlertRead,
  putSettings,
  recordFlightError,
  resolveFlightConflict,
  saveFlight,
  saveManualFlightChanges,
} from '../services/storage';
import type { AppSnapshot } from '../services/storage';

interface FlightViewProps {
  snapshot: AppSnapshot;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}

export function FlightsView(props: FlightViewProps) {
  const { snapshot } = props;
  const [showNew, setShowNew] = useState(false);
  const unread = snapshot.flightAlerts.filter((alert) => !alert.read);

  return (
    <section className="page-stack">
      <section className="flight-hero">
        <div>
          <p className="eyebrow">TravelCaris · {snapshot.activeTrip.name}</p>
          <h2>Vuelos</h2>
          <p>Horarios, cambios, fuentes oficiales e historial familiar en un mismo lugar.</p>
        </div>
        <button className="primary" onClick={() => setShowNew(true)}>
          <Plus size={18} /> Añadir
        </button>
      </section>

      {!navigator.onLine && (
        <div className="notice notice-neutral">
          <WifiOff size={20} />
          <div>
            <strong>Sin conexión</strong>
            <p>Se muestra el último estado guardado; puede estar desactualizado.</p>
          </div>
        </div>
      )}

      <div className="notice notice-neutral">
        <Info size={20} />
        <p>
          La actualización automática no está configurada por defecto. Puedes consultar el vuelo en la fuente oficial y
          registrar cualquier cambio manualmente.
        </p>
      </div>

      {unread.length > 0 && <AlertsInbox {...props} compact />}

      <div className="flight-list">
        {snapshot.flights.map((flight) => (
          <FlightCard key={flight.id} flight={flight} />
        ))}
      </div>

      <CriticalFlightWarnings />
      {showNew && <NewFlightEditor {...props} onClose={() => setShowNew(false)} />}
    </section>
  );
}

export function FlightDetailView(props: FlightViewProps) {
  const { flightId } = useParams();
  const navigate = useNavigate();
  const flight = props.snapshot.flights.find((item) => item.id === flightId);
  const [editing, setEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showImpact, setShowImpact] = useState(false);
  const history = props.snapshot.flightStatusHistory.filter((entry) => entry.flightId === flightId);
  const alerts = props.snapshot.flightAlerts.filter((entry) => entry.flightId === flightId);
  const documents = props.snapshot.documents.filter(
    (document) => document.type === 'Billete' || document.title.toUpperCase().includes(flight?.flightNumber ?? ''),
  );

  if (!flight) {
    return (
      <section className="form-card">
        <h2>Vuelo no encontrado</h2>
        <button onClick={() => navigate('/vuelos')}>Volver a vuelos</button>
      </section>
    );
  }

  const updateNow = async () => {
    if (!navigator.onLine) return props.notify('Sin conexión: se conserva el último estado conocido');
    setUpdating(true);
    try {
      const provider = new InternalApiFlightStatusProvider();
      const result = await provider.getFlightStatus({
        flightNumber: flight.normalizedFlightNumber,
        date: flight.scheduledDate,
        origin: flight.departureIata,
        destination: flight.arrivalIata,
      });
      const changes = await applyFlightStatusResult(flight.id, result);
      await props.refresh();
      props.notify(changes.length ? `${changes.length} cambios detectados` : 'Estado comprobado sin cambios');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar';
      await recordFlightError(flight.id, message, 'Desconocido');
      await props.refresh();
      props.notify(message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <section className="page-stack">
      <button className="back-button" onClick={() => navigate('/vuelos')}>
        <X size={18} /> Cerrar detalle
      </button>
      <FlightCard flight={flight} detail />

      <div className="button-row">
        <button className="primary" onClick={updateNow} disabled={updating}>
          <RefreshCw size={18} className={updating ? 'spinning' : ''} /> {updating ? 'Consultando' : 'Actualizar ahora'}
        </button>
        <button onClick={() => setEditing(true)}>Editar manualmente</button>
        <button
          onClick={async () => {
            await saveFlight({ ...flight, autoUpdateEnabled: !flight.autoUpdateEnabled });
            await props.refresh();
          }}
        >
          {flight.autoUpdateEnabled ? 'Desactivar actualización automática' : 'Activar actualización automática'}
        </button>
        <button onClick={() => setShowImpact((value) => !value)}>Revisar impacto en el itinerario</button>
      </div>

      {Object.keys(flight.automaticConflicts).length > 0 && (
        <section className="conflict-panel">
          <h3>Cambios automáticos pendientes de revisión</h3>
          <p>Se ha conservado el dato introducido por el usuario.</p>
          {Object.entries(flight.automaticConflicts).map(([field, conflict]) => (
            <div className="conflict-row" key={field}>
              <div>
                <strong>{flightFieldLabel(field)}</strong>
                <p>Manual: {String(flight[field as keyof Flight] ?? '—')} · Automático: {conflict.value || '—'}</p>
              </div>
              <button
                onClick={async () => {
                  await resolveFlightConflict(flight.id, field, false);
                  await props.refresh();
                }}
              >
                Mantener manual
              </button>
              <button
                className="primary"
                onClick={async () => {
                  await resolveFlightConflict(flight.id, field, true);
                  await props.refresh();
                }}
              >
                Usar automático
              </button>
            </div>
          ))}
        </section>
      )}

      {showImpact && <ImpactAssistant flight={flight} snapshot={props.snapshot} notify={props.notify} />}

      <section className="flight-detail-grid">
        <DetailSection title="Horarios">
          <FlightTimeRow label="Salida" scheduled={flight.scheduledDepartureTime} estimated={flight.estimatedDepartureTime} actual={flight.actualDepartureTime} />
          <FlightTimeRow label="Llegada" scheduled={flight.scheduledArrivalTime} estimated={flight.estimatedArrivalTime} actual={flight.actualArrivalTime} />
        </DetailSection>
        <DetailSection title="Aeropuerto">
          <Detail label="Terminal de salida" value={flight.departureTerminal} />
          <Detail label="Terminal de llegada" value={flight.arrivalTerminal} />
          <Detail label="Puerta" value={flight.gate} />
          <Detail label="Mostrador" value={flight.checkInCounter} />
          <Detail label="Cinta de equipaje" value={flight.baggageBelt} />
        </DetailSection>
        <DetailSection title="Vuelo">
          <Detail label="Aerolínea" value={`${flight.airline} · ${flight.airlineIata}`} />
          <Detail label="Avión" value={flight.aircraftType} />
          <Detail label="Matrícula" value={flight.aircraftRegistration} />
          <Detail label="Equipaje incluido" value={flight.includedBaggage} />
          <Detail label="Notas familiares" value={flight.notes} />
        </DetailSection>
        <DetailSection title="Datos privados locales">
          <Detail label="Localizador" value={flight.bookingReference} />
          <Detail label="Número de billete" value={flight.ticketNumber} />
          <p className="muted">Estos datos permanecen únicamente en este navegador y nunca se envían al proveedor.</p>
        </DetailSection>
      </section>

      <OfficialFlightLinks flight={flight} />

      <section className="form-card">
        <h3>Documentos relacionados</h3>
        {documents.length ? (
          documents.map((document) => <p key={document.id}>{document.title}</p>)
        ) : (
          <p className="muted">No hay billetes o tarjetas de embarque vinculados todavía.</p>
        )}
      </section>

      <section className="form-card">
        <h3>Historial de cambios</h3>
        {history.length ? (
          <div className="history-list">
            {history.map((entry) => (
              <div key={entry.id} className="history-row">
                <Clock3 size={17} />
                <div>
                  <strong>{flightFieldLabel(entry.field)}</strong>
                  <p>{entry.previousValue || 'Sin dato'} → {entry.newValue || 'Sin dato'}</p>
                  <small>{formatDateTime(entry.detectedAt)} · {entry.source}</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Todavía no se han registrado cambios.</p>
        )}
      </section>

      {alerts.length > 0 && <AlertsInbox {...props} flightId={flight.id} />}

      <div className="notice notice-warning">
        <ShieldAlert size={21} />
        <p>La información puede cambiar. Confirma siempre los datos en la aplicación de la aerolínea y en las pantallas del aeropuerto.</p>
      </div>

      {editing && <ManualFlightEditor flight={flight} {...props} onClose={() => setEditing(false)} />}
    </section>
  );
}

export function FlightSettingsPanel(props: FlightViewProps) {
  const { settings } = props.snapshot;
  const [diagnostic, setDiagnostic] = useState<Awaited<ReturnType<typeof getFlightProviderDiagnostic>> | null>(null);
  const [diagnosticError, setDiagnosticError] = useState('');
  const frequency = useMemo(() => {
    const enabled = props.snapshot.flights.find((flight) => flight.autoUpdateEnabled);
    if (!enabled) return 'Manual';
    const value = recommendedRefreshInterval(enabled);
    return Number.isFinite(value) ? `${Math.round(value / 60_000)} minutos` : 'Solo manual por ahora';
  }, [props.snapshot.flights]);

  const testConnection = async () => {
    try {
      const result = await getFlightProviderDiagnostic();
      setDiagnostic(result);
      setDiagnosticError('');
      await putSettings({ ...settings, flightProvider: result.provider });
      await props.refresh();
    } catch (error) {
      setDiagnosticError(error instanceof Error ? error.message : 'Endpoint no disponible en desarrollo local.');
    }
  };

  return (
    <div className="page-stack">
      <section className="form-card">
        <h2>Ajustes de vuelos</h2>
        <div className="settings-status-grid">
          <Detail label="Proveedor actual" value={diagnostic?.provider ?? settings.flightProvider} />
          <Detail label="Estado de la conexión" value={diagnostic ? (diagnostic.configured ? 'Configurado' : 'Modo gratuito') : 'Sin comprobar'} />
          <Detail label="Última consulta" value={settings.lastFlightQueryAt ? formatDateTime(settings.lastFlightQueryAt) : 'Sin consultas'} />
          <Detail label="Frecuencia estimada" value={frequency} />
          <Detail label="Consumo estimado" value="0 consultas externas en modo gratuito" />
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.flightAutoUpdate}
            onChange={async (event) => {
              await putSettings({ ...settings, flightAutoUpdate: event.target.checked });
              await props.refresh();
            }}
          />
          Actualización automática global
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.flightDataSaver}
            onChange={async (event) => {
              await putSettings({ ...settings, flightDataSaver: event.target.checked });
              await props.refresh();
            }}
          />
          Modo de ahorro de datos
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.flightWifiOnly}
            onChange={async (event) => {
              await putSettings({ ...settings, flightWifiOnly: event.target.checked });
              await props.refresh();
            }}
          />
          Usar solamente Wi-Fi cuando el navegador pueda detectarlo
        </label>
        <div className="button-row">
          <button onClick={testConnection}><RefreshCw size={18} /> Probar conexión</button>
          <button
            onClick={async () => {
              await clearFlightStatusCache();
              await props.refresh();
              props.notify('Caché de estados borrada');
            }}
          >
            Borrar caché de estados
          </button>
        </div>
        {diagnostic && (
          <p className="muted">
            Diagnóstico: proveedor {diagnostic.provider}; actualización automática {diagnostic.automaticUpdatesAvailable ? 'disponible' : 'no disponible'}. No se muestran secretos.
          </p>
        )}
        {diagnosticError && <p className="error">{diagnosticError}</p>}
      </section>
      <FlightNotificationsPanel {...props} />
      <div className="notice notice-neutral">
        <Info size={20} />
        <p>Las claves se configuran únicamente en el entorno del despliegue. TravelCaris no permite guardarlas en el navegador.</p>
      </div>
    </div>
  );
}

export function AlertsInbox({ snapshot, refresh, notify, compact = false, flightId }: FlightViewProps & { compact?: boolean; flightId?: string }) {
  const alerts = snapshot.flightAlerts.filter((alert) => !flightId || alert.flightId === flightId);
  const visible = compact ? alerts.filter((alert) => !alert.read).slice(0, 3) : alerts;
  if (!visible.length) return null;
  return (
    <section className="alerts-panel">
      <div className="section-heading">
        <div><p className="eyebrow">Bandeja interna</p><h3>Alertas de vuelos</h3></div>
        <BellRing size={22} />
      </div>
      {visible.map((alert) => (
        <article className={`alert-item alert-${alert.type.toLowerCase()}`} key={alert.id}>
          <AlertTriangle size={20} />
          <div>
            <strong>{alert.message}</strong>
            <p>{alert.recommendedAction}</p>
            <small>{formatDateTime(alert.createdAt)} · {alert.source}</small>
          </div>
          {!alert.read && (
            <button
              aria-label="Marcar alerta como leída"
              title="Marcar como leída"
              onClick={async () => {
                await markAlertRead(alert);
                await refresh();
                notify('Alerta marcada como leída');
              }}
            >
              <CheckCircle2 size={18} />
            </button>
          )}
        </article>
      ))}
    </section>
  );
}

function FlightCard({ flight, detail = false }: { flight: Flight; detail?: boolean }) {
  const navigate = useNavigate();
  const stale = isFlightDataStale(flight);
  return (
    <article className={`flight-card tone-${statusTone(flight)} ${detail ? 'flight-card-detail' : ''}`}>
      <div className="flight-card-top">
        <div>
          <p className="airline-name">{flight.airline}</p>
          <h3>{flight.flightNumber}</h3>
        </div>
        <span className="flight-status"><StatusIcon status={flight.status} /> {flight.status}</span>
      </div>
      <p className="flight-date">{formatDate(flight.scheduledDate)}</p>
      <div className="flight-route" aria-label={`${flight.departureIata} a ${flight.arrivalIata}`}>
        <div><strong>{flight.departureIata}</strong><span>{flight.estimatedDepartureTime || flight.scheduledDepartureTime}</span></div>
        <div className="route-line"><Plane size={18} /><span /></div>
        <div><strong>{flight.arrivalIata}</strong><span>{flight.estimatedArrivalTime || flight.scheduledArrivalTime}</span></div>
      </div>
      <div className="flight-meta">
        <span>Retraso: {flight.delayMinutes ? `${flight.delayMinutes} min` : 'sin retraso registrado'}</span>
        <span>Terminal: {flight.departureTerminal || flight.arrivalTerminal || 'sin dato'}</span>
        <span>Puerta: {flight.gate || 'sin asignar'}</span>
      </div>
      <div className="flight-source-row">
        <span>{providerLabel(flight.lastStatusProvider)}</span>
        <span>{flight.lastCheckedAt ? `Actualizado ${formatDateTime(flight.lastCheckedAt)}` : 'Sin consulta automática'}</span>
      </div>
      {stale && <p className="stale-warning"><Clock3 size={16} /> Datos sin actualizar o caducados</p>}
      {flight.lastUpdateError && <p className="error">{flight.lastUpdateError}</p>}
      {!detail && (
        <button className="flight-open" onClick={() => navigate(`/vuelos/${flight.id}`)}>
          Ver detalle <ChevronRight size={18} />
        </button>
      )}
    </article>
  );
}

function NewFlightEditor({ onClose, ...props }: FlightViewProps & { onClose: () => void }) {
  const [form, setForm] = useState({
    airline: '',
    airlineIata: '',
    flightNumber: '',
    scheduledDate: props.snapshot.activeTrip.startDate,
    departureAirport: '',
    departureIata: '',
    arrivalAirport: '',
    arrivalIata: '',
    scheduledDepartureTime: '',
    scheduledArrivalTime: '',
  });
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Añadir vuelo">
        <h2>Añadir vuelo</h2>
        <div className="two-cols">
          <label>Aerolínea<input value={form.airline} onChange={(event) => setForm({ ...form, airline: event.target.value })} /></label>
          <label>Código IATA<input maxLength={3} value={form.airlineIata} onChange={(event) => setForm({ ...form, airlineIata: event.target.value.toUpperCase() })} /></label>
        </div>
        <div className="two-cols">
          <label>Número de vuelo<input value={form.flightNumber} onChange={(event) => setForm({ ...form, flightNumber: event.target.value.toUpperCase() })} /></label>
          <label>Fecha<input type="date" value={form.scheduledDate} onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })} /></label>
        </div>
        <div className="two-cols">
          <label>Origen<input value={form.departureAirport} onChange={(event) => setForm({ ...form, departureAirport: event.target.value })} /></label>
          <label>IATA origen<input maxLength={3} value={form.departureIata} onChange={(event) => setForm({ ...form, departureIata: event.target.value.toUpperCase() })} /></label>
        </div>
        <div className="two-cols">
          <label>Destino<input value={form.arrivalAirport} onChange={(event) => setForm({ ...form, arrivalAirport: event.target.value })} /></label>
          <label>IATA destino<input maxLength={3} value={form.arrivalIata} onChange={(event) => setForm({ ...form, arrivalIata: event.target.value.toUpperCase() })} /></label>
        </div>
        <div className="two-cols">
          <label>Salida<input type="time" value={form.scheduledDepartureTime} onChange={(event) => setForm({ ...form, scheduledDepartureTime: event.target.value })} /></label>
          <label>Llegada<input type="time" value={form.scheduledArrivalTime} onChange={(event) => setForm({ ...form, scheduledArrivalTime: event.target.value })} /></label>
        </div>
        <div className="button-row end">
          <button onClick={onClose}>Cancelar</button>
          <button
            className="primary"
            onClick={async () => {
              if (!form.flightNumber || !form.scheduledDate || !form.departureIata || !form.arrivalIata) {
                return props.notify('Número, fecha, origen y destino son obligatorios');
              }
              try {
                await createFlight({ ...form, tripId: props.snapshot.activeTrip.id });
                await props.refresh();
                onClose();
                props.notify('Vuelo añadido');
              } catch (error) {
                props.notify(error instanceof Error ? error.message : 'No se pudo añadir el vuelo');
              }
            }}
          >
            Guardar vuelo
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualFlightEditor({ flight, onClose, refresh, notify }: FlightViewProps & { flight: Flight; onClose: () => void }) {
  const [form, setForm] = useState(flight);
  const set = <K extends keyof Flight>(field: K, value: Flight[K]) => setForm((current) => ({ ...current, [field]: value }));
  const fields: Array<[keyof Flight, string, 'text' | 'time' | 'number']> = [
    ['estimatedDepartureTime', 'Salida estimada', 'time'],
    ['actualDepartureTime', 'Salida real', 'time'],
    ['estimatedArrivalTime', 'Llegada estimada', 'time'],
    ['actualArrivalTime', 'Llegada real', 'time'],
    ['departureTerminal', 'Terminal de salida', 'text'],
    ['arrivalTerminal', 'Terminal de llegada', 'text'],
    ['gate', 'Puerta', 'text'],
    ['checkInCounter', 'Mostrador de facturación', 'text'],
    ['baggageBelt', 'Cinta de equipaje', 'text'],
    ['delayMinutes', 'Minutos de retraso', 'number'],
    ['aircraftType', 'Tipo de avión', 'text'],
    ['aircraftRegistration', 'Matrícula', 'text'],
  ];
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Editar vuelo manualmente">
        <h2>Registrar un cambio</h2>
        <div className="two-cols">
          <label>Estado<select value={form.status} onChange={(event) => set('status', event.target.value as FlightStatus)}>{flightStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Fuente<input value={form.lastStatusProvider} onChange={(event) => set('lastStatusProvider', event.target.value as Flight['lastStatusProvider'])} /></label>
        </div>
        <div className="two-cols">
          {fields.map(([field, label, type]) => (
            <label key={field}>{label}<input type={type} value={String(form[field] ?? '')} onChange={(event) => set(field, (type === 'number' ? Number(event.target.value) : event.target.value) as never)} /></label>
          ))}
        </div>
        <label>Equipaje incluido<textarea value={form.includedBaggage} onChange={(event) => set('includedBaggage', event.target.value)} /></label>
        <label>Notas familiares<textarea value={form.notes} onChange={(event) => set('notes', event.target.value)} /></label>
        <label>Localizador local<input value={form.bookingReference} onChange={(event) => set('bookingReference', event.target.value)} /></label>
        <label>Número de billete local<input value={form.ticketNumber} onChange={(event) => set('ticketNumber', event.target.value)} /></label>
        <p className="muted">Los campos modificados quedarán marcados como «Introducido por el usuario» con fecha y hora.</p>
        <div className="button-row end">
          <button onClick={onClose}>Cancelar</button>
          <button
            className="primary"
            onClick={async () => {
              await saveManualFlightChanges(flight.id, form);
              await refresh();
              onClose();
              notify('Cambios manuales guardados');
            }}
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

function OfficialFlightLinks({ flight }: { flight: Flight }) {
  return (
    <section className="form-card">
      <h3>Fuentes oficiales</h3>
      <p className="muted">Introduce {flight.flightNumber} y {formatDate(flight.scheduledDate)} si el buscador no abre el vuelo directamente.</p>
      <div className="grid-actions">
        <OfficialLink href={flight.officialTrackingUrl} label="Consultar en la aerolínea" />
        <OfficialLink href={flight.departureAirportUrl} label="Aeropuerto de salida" />
        <OfficialLink href={flight.arrivalAirportUrl} label="Aeropuerto de llegada" />
      </div>
    </section>
  );
}

function OfficialLink({ href, label }: { href: string; label: string }) {
  if (!isSafeExternalUrl(href)) return null;
  return <a className="external-button" href={href} target="_blank" rel="noreferrer"><ExternalLink size={17} /> {label}</a>;
}

function FlightNotificationsPanel({ snapshot, refresh, notify }: FlightViewProps) {
  const [explained, setExplained] = useState(false);
  const activate = async () => {
    if (!('Notification' in window)) return notify('Este navegador no admite notificaciones web');
    const permission = await Notification.requestPermission();
    await putSettings({ ...snapshot.settings, flightNotifications: permission === 'granted' });
    await refresh();
    notify(permission === 'granted' ? 'Avisos de vuelos activados' : 'TravelCaris seguirá funcionando sin notificaciones');
  };
  return (
    <section className="form-card">
      <h3><Bell size={19} /> Avisos del dispositivo</h3>
      {!explained ? (
        <button onClick={() => setExplained(true)}>Activar avisos de vuelos</button>
      ) : (
        <>
          <p>Los avisos pueden incluir retrasos, cancelaciones, terminales, puertas y horas previstas.</p>
          <p className="muted">La compatibilidad depende del dispositivo. Una PWA cerrada no puede garantizar actualizaciones sin un servicio push en servidor. Los avisos oficiales de la aerolínea siguen siendo prioritarios.</p>
          <button className="primary" onClick={activate}>Solicitar permiso</button>
        </>
      )}
    </section>
  );
}

function ImpactAssistant({ flight, snapshot, notify }: { flight: Flight; snapshot: AppSnapshot; notify: (message: string) => void }) {
  const arrival = flight.arrivalIata === 'LGW' || flight.arrivalIata === 'LTN';
  const suggestions = arrival
    ? ['Revisar el traslado desde el aeropuerto', 'Mover o reducir la primera visita', 'Contactar con el alojamiento si cambia la llegada']
    : ['Mantener la hora original de llegada al aeropuerto', 'Revisar el tren o traslado al aeropuerto', 'Comprobar facturación, equipaje y embarque en la reserva'];
  if (flight.status === 'Cancelado') suggestions.unshift('Marcar las actividades relacionadas para revisión');
  const related = snapshot.activities.filter((activity) => activity.day === flight.scheduledDate);
  return (
    <section className="impact-panel">
      <p className="eyebrow">Asistente interno</p>
      <h3>Revisar impacto en el itinerario</h3>
      <ul>{suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>
      <p>{related.length} actividades del mismo día podrían necesitar revisión. TravelCaris no modificará ninguna sin confirmación.</p>
      <button onClick={() => notify('Sugerencias revisadas; no se ha modificado el itinerario')}>Confirmar revisión sin cambios</button>
    </section>
  );
}

function CriticalFlightWarnings() {
  return (
    <section className="critical-warnings">
      <h3>Avisos críticos permanentes</h3>
      <ul>
        <li>Un retraso no cambia automáticamente la hora límite de facturación.</li>
        <li>Un retraso no implica que se deba llegar más tarde al aeropuerto.</li>
        <li>Las puertas y terminales pueden cambiar a última hora.</li>
        <li>Para easyJet, mantén los horarios de la reserva salvo comunicación oficial.</li>
        <li>La aerolínea y las pantallas del aeropuerto son la fuente prioritaria.</li>
        <li>TravelCaris es una herramienta organizativa y no sustituye la información oficial.</li>
      </ul>
    </section>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3>{children}</section>;
}

function Detail({ label, value }: { label: string; value?: string | number }) {
  return <div className="detail-row"><span>{label}</span><strong>{value || 'Sin dato'}</strong></div>;
}

function FlightTimeRow({ label, scheduled, estimated, actual }: { label: string; scheduled: string; estimated: string; actual: string }) {
  return (
    <div className="time-comparison">
      <strong>{label}</strong>
      <span>Programada {scheduled || '—'}</span>
      <span>Estimada {estimated || '—'}</span>
      <span>Real {actual || '—'}</span>
    </div>
  );
}

function StatusIcon({ status }: { status: FlightStatus }) {
  if (status === 'Cancelado' || status === 'Desviado') return <AlertTriangle size={16} />;
  if (status === 'Aterrizado' || status === 'Finalizado') return <CheckCircle2 size={16} />;
  return <Clock3 size={16} />;
}

function statusTone(flight: Flight) {
  if (flight.status === 'Cancelado' || flight.status === 'Desviado' || flight.delayMinutes >= 60) return 'danger';
  if (flight.status === 'Retrasado' || flight.delayMinutes > 0 || Object.keys(flight.automaticConflicts).length) return 'warning';
  if (flight.status === 'Aterrizado' || flight.status === 'Finalizado' || flight.status === 'Confirmado') return 'success';
  return 'neutral';
}

function flightFieldLabel(field: string) {
  const labels: Record<string, string> = {
    status: 'Estado',
    delayMinutes: 'Retraso',
    departureTerminal: 'Terminal de salida',
    arrivalTerminal: 'Terminal de llegada',
    gate: 'Puerta',
    estimatedDepartureTime: 'Salida estimada',
    estimatedArrivalTime: 'Llegada estimada',
    actualDepartureTime: 'Salida real',
    actualArrivalTime: 'Llegada real',
    arrivalAirport: 'Aeropuerto de llegada',
    arrivalIata: 'Código de llegada',
  };
  return labels[field] ?? field;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value: string) {
  if (!value) return 'Sin actualizar';
  return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function useAutomaticFlightRefresh({ snapshot, refresh, notify }: FlightViewProps) {
  useEffect(() => {
    const onVisible = async () => {
      if (
        document.visibilityState !== 'visible' ||
        !navigator.onLine ||
        !snapshot.settings.flightAutoUpdate ||
        snapshot.settings.flightProvider === 'manual'
      ) return;
      const due = snapshot.flights.filter(
        (flight) => flight.autoUpdateEnabled && isFlightDataStale(flight) && Number.isFinite(recommendedRefreshInterval(flight)),
      );
      for (const flight of due) {
        try {
          const result: FlightStatusResult = await new InternalApiFlightStatusProvider().getFlightStatus({
            flightNumber: flight.normalizedFlightNumber,
            date: flight.scheduledDate,
            origin: flight.departureIata,
            destination: flight.arrivalIata,
          });
          await applyFlightStatusResult(flight.id, result);
        } catch {
          // The latest known state remains available; manual and official sources still work.
        }
      }
      if (due.length) {
        await refresh();
        notify('Estados de vuelo comprobados');
      }
    };
    void onVisible();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [snapshot, refresh, notify]);
}
