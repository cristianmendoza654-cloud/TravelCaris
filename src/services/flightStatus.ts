import type {
  AlertType,
  Flight,
  FlightDataSource,
  FlightLookupInput,
  FlightStatusProvider,
  FlightStatusResult,
} from '../domain/types';

export interface DetectedFlightChange {
  field: keyof Flight;
  previousValue: string;
  newValue: string;
  important: boolean;
  alertType: AlertType;
  message: string;
  recommendedAction: string;
}

export function normalizeFlightNumber(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^EZY\d+$/.test(compact)) return `U2${compact.slice(3)}`;
  return compact;
}

export function flightNumberVariants(value: string) {
  const normalized = normalizeFlightNumber(value);
  const match = normalized.match(/^([A-Z0-9]{2})(\d+)$/);
  if (!match) return [normalized];
  const [, airline, number] = match;
  const variants = new Set([normalized, `${airline} ${number}`]);
  if (airline === 'U2') variants.add(`EZY${number}`);
  return [...variants];
}

const monitoredFields: Array<keyof FlightStatusResult & keyof Flight> = [
  'status',
  'delayMinutes',
  'departureTerminal',
  'arrivalTerminal',
  'gate',
  'estimatedDepartureTime',
  'estimatedArrivalTime',
  'arrivalAirport',
  'arrivalIata',
  'actualDepartureTime',
  'actualArrivalTime',
];

const text = (value: unknown) => (value === undefined || value === null ? '' : String(value));

export function detectFlightChanges(flight: Flight, result: FlightStatusResult): DetectedFlightChange[] {
  return monitoredFields.flatMap((field) => {
    if (result[field] === undefined || text(flight[field]) === text(result[field])) return [];
    const previousValue = text(flight[field]);
    const newValue = text(result[field]);
    const number = flight.flightNumber;

    if (field === 'status' && newValue === 'Cancelado') {
      return [change(field, previousValue, newValue, true, 'Urgente', `El vuelo ${number} ha sido cancelado`, 'Consulta inmediatamente con la aerolínea y revisa el itinerario.')];
    }
    if (field === 'status' && newValue === 'Desviado') {
      return [change(field, previousValue, newValue, true, 'Urgente', `El vuelo ${number} ha sido desviado`, 'Confirma el aeropuerto de llegada y revisa los traslados.')];
    }
    if (field === 'status' && newValue === 'Embarque') {
      return [change(field, previousValue, newValue, true, 'Importante', `Ha comenzado el embarque del vuelo ${number}`, 'Dirígete a la puerta indicada y sigue las pantallas del aeropuerto.')];
    }
    if (field === 'actualDepartureTime') {
      return [change(field, previousValue, newValue, true, 'Información', `El vuelo ${number} ha despegado`, 'Consulta la hora prevista de llegada.')];
    }
    if (field === 'actualArrivalTime' || (field === 'status' && newValue === 'Aterrizado')) {
      return [change(field, previousValue, newValue, true, 'Información', `El vuelo ${number} ha aterrizado`, 'Comprueba la cinta de equipaje y el traslado.')];
    }
    if (field === 'delayMinutes') {
      const delay = Number(newValue);
      const previousDelay = Number(previousValue || 0);
      const reduced = delay < previousDelay;
      return [
        change(
          field,
          previousValue,
          newValue,
          delay >= 30,
          delay >= 60 ? 'Urgente' : delay >= 30 ? 'Importante' : 'Atención',
          reduced
            ? `El retraso del vuelo ${number} se ha reducido a ${delay} minutos`
            : `El vuelo ${number} tiene ${delay} minutos de retraso`,
          'Mantén la hora original de llegada al aeropuerto salvo comunicación oficial.',
        ),
      ];
    }
    if (field === 'gate') {
      return [change(field, previousValue, newValue, true, 'Importante', `Se ha asignado la puerta ${newValue} al vuelo ${number}`, 'Confirma la puerta en las pantallas del aeropuerto.')];
    }
    if (field === 'departureTerminal' || field === 'arrivalTerminal') {
      return [change(field, previousValue, newValue, true, 'Importante', `La terminal del vuelo ${number} ha cambiado a ${newValue}`, 'Revisa el traslado y confirma la terminal en la fuente oficial.')];
    }
    if (field === 'estimatedDepartureTime' || field === 'estimatedArrivalTime') {
      return [change(field, previousValue, newValue, true, 'Atención', `La hora prevista del vuelo ${number} ha cambiado a las ${newValue}`, 'Comprueba la información oficial y revisa posibles impactos.')];
    }
    if (field === 'arrivalAirport' || field === 'arrivalIata') {
      return [change(field, previousValue, newValue, true, 'Urgente', `Ha cambiado el aeropuerto de llegada del vuelo ${number}`, 'Revisa urgentemente el traslado y el alojamiento.')];
    }
    return [change(field, previousValue, newValue, false, 'Información', `Se ha actualizado ${String(field)} del vuelo ${number}`, 'Comprueba el detalle del vuelo.')];
  });
}

function change(
  field: keyof Flight,
  previousValue: string,
  newValue: string,
  important: boolean,
  alertType: AlertType,
  message: string,
  recommendedAction: string,
): DetectedFlightChange {
  return { field, previousValue, newValue, important, alertType, message, recommendedAction };
}

export function isFlightDataStale(flight: Flight, now = new Date()) {
  if (!flight.lastCheckedAt) return true;
  const age = now.getTime() - new Date(flight.lastCheckedAt).getTime();
  return age > recommendedRefreshInterval(flight, now);
}

export function recommendedRefreshInterval(flight: Flight, now = new Date()) {
  if (['Aterrizado', 'Finalizado', 'Cancelado'].includes(flight.status)) return Number.POSITIVE_INFINITY;
  const departure = new Date(`${flight.scheduledDate}T${flight.scheduledDepartureTime || '00:00'}:00`);
  const hours = (departure.getTime() - now.getTime()) / 3_600_000;
  if (hours > 48) return Number.POSITIVE_INFINITY;
  if (hours > 12) return 60 * 60 * 1000;
  if (hours > 3) return 30 * 60 * 1000;
  if (hours > 0) return 15 * 60 * 1000;
  if (hours > -12) return 10 * 60 * 1000;
  return Number.POSITIVE_INFINITY;
}

export class InternalApiFlightStatusProvider implements FlightStatusProvider {
  async getFlightStatus(input: FlightLookupInput): Promise<FlightStatusResult> {
    const response = await fetch('/api/flights/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json()) as FlightStatusResult & { error?: string };
    if (!response.ok) throw new Error(body.error || 'No se pudo consultar el estado del vuelo.');
    return body;
  }
}

export async function getFlightProviderDiagnostic() {
  const response = await fetch('/api/flights/status', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('No se pudo consultar el diagnóstico.');
  return (await response.json()) as {
    provider: 'manual' | 'aerodatabox' | 'flightaware';
    configured: boolean;
    automaticUpdatesAvailable: boolean;
  };
}

export function providerLabel(source: FlightDataSource) {
  return source === 'Manual' || source === 'Usuario' ? 'Modo gratuito · actualización manual' : source;
}
