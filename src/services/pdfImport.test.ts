import { describe, expect, it } from 'vitest';
import { parseTravelDocumentText } from './pdfImport';

const sample = [
  `ROMA EN FAMILIA · 3-5 SEPTIEMBRE 2027
Guía personalizada
Llegada: Iberia IB1234, Madrid-Roma, viernes 3 de septiembre (08:00-10:30).
Regreso: Iberia IB4321, Roma-Madrid, domingo 5 de septiembre (19:00-21:35).
ALOJAMIENTO 1
Hotel Central
Via de Ejemplo 10
3. Itinerario diario
Día 1 · Viernes 3 · Centro histórico
Hora Plan Coste / reserva Notas
11:30 Paseo por la plaza principal. Gratis Zona peatonal.
14:00 Comida en restaurante local. €12-€18 adulto
17:00 Cena en familia. €20 familia
Día 2 · Sábado 4 · Museos
10:00 Museo de la ciudad. Gratis. Reserva aconsejada.
4. Comer bien sin gastar demasiado`,
];

describe('importación local de itinerarios PDF', () => {
  it('detecta viaje, actividades, alojamiento y vuelos', () => {
    const result = parseTravelDocumentText(sample, 'viaje-ficticio.pdf');
    expect(result.trip).toEqual({
      name: 'Viaje a Roma',
      destination: 'Roma',
      country: 'Italia',
      startDate: '2027-09-03',
      endDate: '2027-09-05',
    });
    expect(result.activities.map((item) => item.startTime)).toEqual(['11:30', '14:00', '17:00', '10:00']);
    expect(result.activities[0].priceDetails?.kind).toBe('Gratis');
    expect(result.accommodations[0]).toMatchObject({ name: 'Hotel Central', address: 'Via de Ejemplo 10' });
    expect(result.flights.map((item) => item.flightNumber)).toEqual(['IB1234', 'IB4321']);
    expect(result.flights[0].officialTrackingUrl).toMatch(/^https:\/\//);
    expect(result.flights[0].departureAirportUrl).toMatch(/^https:\/\//);
  });

  it('rechaza un documento sin texto útil', () => {
    expect(() => parseTravelDocumentText(['   '])).toThrow(/texto suficiente/i);
  });
});
