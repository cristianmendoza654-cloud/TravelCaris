import type { Accommodation, Activity, Flight, PackingItem, TravelDocument, Trip } from '../domain/types';

export interface ReadinessStep {
  id: string;
  label: string;
  done: boolean;
  href: '/itinerario' | '/mas';
  tab?: 'Viajes' | 'Alojamientos' | 'Documentos' | 'Equipaje';
}

interface ReadinessInput {
  trip: Trip;
  activities: Activity[];
  accommodations: Accommodation[];
  flights: Flight[];
  documents: TravelDocument[];
  packingItems: PackingItem[];
}

export function travelReadiness(input: ReadinessInput) {
  const { trip, activities, accommodations, flights, documents, packingItems } = input;
  const tripDays = Math.max(1, Math.round((new Date(`${trip.endDate}T12:00:00`).getTime() - new Date(`${trip.startDate}T12:00:00`).getTime()) / 86_400_000) + 1);
  const steps: ReadinessStep[] = [
    {
      id: 'profile',
      label: 'Completar perfil y viajeros',
      done: Boolean(trip.destination.trim() && trip.destination !== 'Destino' && trip.country.trim() && trip.travellers.length),
      href: '/mas',
      tab: 'Viajes',
    },
    { id: 'itinerary', label: 'Preparar el itinerario', done: activities.some((item) => item.planType === 'Principal'), href: '/itinerario' },
  ];

  if (tripDays > 1) {
    steps.push({ id: 'accommodation', label: 'Añadir alojamiento', done: accommodations.length > 0, href: '/mas', tab: 'Alojamientos' });
    steps.push({ id: 'packing', label: 'Preparar el equipaje', done: packingItems.length > 0 && packingItems.every((item) => item.done), href: '/mas', tab: 'Equipaje' });
  }
  if (flights.length) {
    steps.push({ id: 'documents', label: 'Guardar billetes y documentos', done: documents.length > 0, href: '/mas', tab: 'Documentos' });
  }
  const reservations = activities.filter((item) => item.reservationRequired || ['Necesaria', 'Pendiente', 'Reservada'].includes(item.reservationStatus));
  if (reservations.length) {
    steps.push({ id: 'reservations', label: 'Cerrar reservas pendientes', done: reservations.every((item) => item.reservationDone || item.reservationStatus === 'Reservada'), href: '/itinerario' });
  }

  const completed = steps.filter((step) => step.done).length;
  return { steps, completed, total: steps.length, percentage: Math.round((completed / steps.length) * 100) };
}
