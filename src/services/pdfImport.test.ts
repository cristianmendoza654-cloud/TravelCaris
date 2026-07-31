import { describe, expect, it } from 'vitest';
import { parseTravelDocumentText, validatePdfImportDraft } from './pdfImport';

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

  it('prioriza el anexo estructurado creado para TravelCaris', () => {
    const result = parseTravelDocumentText([`TRAVELCARIS-AI-PDF-V1
[VIAJE]
NOMBRE: Escapada a Roma
DESTINO: Roma
PAIS: Italia
INICIO: 2027-09-03
FIN: 2027-09-05
[ACTIVIDAD]
FECHA: 2027-09-03
INICIO: 11:30
FIN: 13:00
TITULO: Coliseo
CATEGORIA: Monumento
DIRECCION: Piazza del Colosseo, Roma
LATITUD: 41.8902
LONGITUD: 12.4922
DURACION_MIN: 90
DESCRIPCION: Visita con tiempo de acceso incluido
RESERVA: Necesaria
ENLACE_OFICIAL: https://colosseo.it/
PRECIO_TOTAL: 54
MONEDA: EUR
ENTORNO: Mixto
[FIN_ACTIVIDAD]
[ALOJAMIENTO]
NOMBRE: Hotel de ejemplo
DIRECCION: Via Roma 1
INICIO: 2027-09-03
FIN: 2027-09-05
CHECK_IN: 15:00
CHECK_OUT: 11:00
[FIN_ALOJAMIENTO]
[VUELO]
COMPANIA: Iberia
NUMERO: IB1234
FECHA: 2027-09-03
ORIGEN: Madrid
ORIGEN_IATA: MAD
DESTINO: Roma Fiumicino
DESTINO_IATA: FCO
SALIDA: 08:00
LLEGADA: 10:30
[FIN_VUELO]
[FIN_TRAVELCARIS]`], 'chatgpt-roma.pdf');

    expect(result.sourceFormat).toBe('travelcaris-ai-v1');
    expect(result.trip.name).toBe('Escapada a Roma');
    expect(result.activities[0]).toMatchObject({
      title: 'Coliseo',
      category: 'Monumento',
      lat: 41.8902,
      lng: 12.4922,
      reservationStatus: 'Necesaria',
      officialLink: 'https://colosseo.it/',
    });
    expect(result.accommodations[0].name).toBe('Hotel de ejemplo');
    expect(result.flights[0]).toMatchObject({ flightNumber: 'IB1234', departureIata: 'MAD', arrivalIata: 'FCO' });
  });

  it('descarta enlaces y coordenadas no seguros del anexo', () => {
    const result = parseTravelDocumentText([`TRAVELCARIS-AI-PDF-V1
[VIAJE]
NOMBRE: Viaje de prueba
DESTINO: Prueba
PAIS: Prueba
INICIO: 2027-09-03
FIN: 2027-09-03
[ACTIVIDAD]
FECHA: 2027-09-03
INICIO: 10:00
TITULO: Actividad de prueba
CATEGORIA: Otros
LATITUD: 190
LONGITUD: 500
ENLACE_OFICIAL: javascript:alert(1)
[FIN_ACTIVIDAD]
[FIN_TRAVELCARIS]`]);
    expect(result.activities[0].lat).toBeUndefined();
    expect(result.activities[0].lng).toBeUndefined();
    expect(result.activities[0].officialLink).toBe('');
  });

  it('bloquea una importación con elementos fuera del viaje', () => {
    const result = parseTravelDocumentText(sample, 'viaje-ficticio.pdf');
    result.activities[0].day = '2030-01-01';
    expect(validatePdfImportDraft(result)).toContain('La actividad 1 está fuera de las fechas del viaje.');
  });
});
