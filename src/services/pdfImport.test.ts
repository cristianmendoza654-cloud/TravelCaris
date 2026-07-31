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
    expect(result.trip).toMatchObject({
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

  it('recupera alojamientos geográficos y una tabla de vuelos cuando falta el anexo V3', () => {
    const result = parseTravelDocumentText([`LONDRES EN FAMILIA
1-5 DE AGOSTO DE 2026
FORMATO TRAVELCARIS-AI-PDF-V3
ALOJ-01 Apartamento Centro VERIFICADO_USUARIO + GEOCODIFICADO
TIPO / ACCESO: PUERTA DEL EDIFICIO · ALOJAMIENTO
DIRECCION: 10 Example Street, London, Reino Unido
LATITUD: 51.520359    LONGITUD: -0.117218
HORARIO / PRECIO: Entrada 01/08 15:00 · salida 04/08 11:00
NOTA: Alojamiento confirmado sin datos privados.
ALOJ-02 Apartamento Estación VERIFICADO_USUARIO + GEOCODIFICADO
TIPO / ACCESO: PUERTA DEL EDIFICIO · ALOJAMIENTO
DIRECCION: 20 Sample Road, London, Reino Unido
LATITUD: 51.491180    LONGITUD: -0.143150
HORARIO / PRECIO: Entrada 04/08 · salida 05/08
NOTA: Segundo alojamiento confirmado.
7. Vuelos y traslados
TRAMO VUELO FECHA SALIDA LLEGADA ESTADO
IDA VY1234 01/08/2026 ALC 06:05 LGW South 07:50 CONFIRMADO
VUELTA U22315 05/08/2026 LTN 20:00 ALC 23:40 CONFIRMADO`], 'v3-sin-anexo.pdf');

    expect(result.sourceFormat).toBe('general');
    expect(result.accommodations).toHaveLength(2);
    expect(result.accommodations[0]).toMatchObject({
      name: 'Apartamento Centro',
      startDate: '2026-08-01',
      endDate: '2026-08-04',
      checkIn: '15:00',
      checkOut: '11:00',
      lat: 51.520359,
      lng: -0.117218,
    });
    expect(result.flights).toHaveLength(2);
    expect(result.flights[0]).toMatchObject({ flightNumber: 'VY1234', scheduledDate: '2026-08-01', departureIata: 'ALC', arrivalIata: 'LGW', scheduledDepartureTime: '06:05', scheduledArrivalTime: '07:50' });
    expect(result.flights[1]).toMatchObject({ flightNumber: 'U22315', scheduledDate: '2026-08-05', departureIata: 'LTN', arrivalIata: 'ALC' });
  });

  it('importa el perfil, recordatorios y equipaje del formato V2', () => {
    const result = parseTravelDocumentText([`TRAVELCARIS-AI-PDF-V2
[VIAJE]
NOMBRE: Roma en familia
DESTINO: Roma
PAIS: Italia
INICIO: 2027-09-03
FIN: 2027-09-05
DESCRIPCION: Historia, plazas y comidas sin prisas
VIAJEROS: 2 adultos; niño de 8 años
MONEDA_DESTINO: EUR
MONEDA_VIAJERO: GBP
PRESUPUESTO: 950
[RECORDATORIO]
TITULO: Reservar el Coliseo
FECHA: 2027-08-03
HORA: 09:00
NOTAS: Revisar la web oficial
[FIN_RECORDATORIO]
[EQUIPAJE]
LISTA: Tecnología
ELEMENTO: Cargador portátil
PERSONA: Todos
CANTIDAD: 2
NOTAS: Cargar la noche anterior
[FIN_EQUIPAJE]
[FIN_TRAVELCARIS]`]);
    expect(result.sourceFormat).toBe('travelcaris-ai-v2');
    expect(result.trip).toMatchObject({ travellers: ['2 adultos', 'niño de 8 años'], secondaryCurrency: 'GBP', budget: 950 });
    expect(result.reminders[0]).toMatchObject({ title: 'Reservar el Coliseo', date: '2027-08-03', time: '09:00' });
    expect(result.packingItems[0]).toMatchObject({ title: 'Cargador portátil', list: 'Tecnología', quantity: 2 });
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

  it('importa verificación y elementos completados del formato V3', () => {
    const result = parseTravelDocumentText([`TRAVELCARIS-AI-PDF-V3
[VIAJE]
NOMBRE: Roma verificada
DESTINO: Roma
PAIS: Italia
INICIO: 2027-09-03
FIN: 2027-09-03
[ACTIVIDAD]
FECHA: 2027-09-03
INICIO: 10:00
TITULO: Coliseo
CATEGORIA: Monumento
DIRECCION: Piazza del Colosseo, Roma
VERIFICACION: Verificado
FECHA_VERIFICACION: 2027-08-20
[FIN_ACTIVIDAD]
[RECORDATORIO]
TITULO: Comprar entradas
FECHA: 2027-08-01
HORA: 09:00
COMPLETADO: Si
[FIN_RECORDATORIO]
[EQUIPAJE]
LISTA: Documentación
ELEMENTO: Seguro
PREPARADO: Si
[FIN_EQUIPAJE]
[FIN_TRAVELCARIS]`]);
    expect(result.sourceFormat).toBe('travelcaris-ai-v3');
    expect(result.activities[0]).toMatchObject({ verificationStatus: 'Verificado', lastVerifiedAt: '2027-08-20' });
    expect(result.reminders[0].done).toBe(true);
    expect(result.packingItems[0].done).toBe(true);
  });

  it('bloquea una importación con elementos fuera del viaje', () => {
    const result = parseTravelDocumentText(sample, 'viaje-ficticio.pdf');
    result.activities[0].day = '2030-01-01';
    expect(validatePdfImportDraft(result)).toContain('La actividad 1 está fuera de las fechas del viaje.');
  });
});
