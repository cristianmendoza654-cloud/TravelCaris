export interface AiItineraryBrief {
  destination: string;
  country: string;
  startDate: string;
  endDate: string;
  travellers: string;
  budget: string;
  pace: 'Tranquilo' | 'Equilibrado' | 'Intenso';
  interests: string;
  accommodation: string;
  transport: string;
  accessibility: string;
  food: string;
  notes: string;
}

export const travelCarisAiFormat = 'TRAVELCARIS-AI-PDF-V1';

export function buildAiItineraryPrompt(brief: AiItineraryBrief) {
  const details = [
    ['Destino', brief.destination],
    ['País', brief.country],
    ['Fechas', dateRange(brief.startDate, brief.endDate)],
    ['Viajeros', brief.travellers],
    ['Presupuesto', brief.budget],
    ['Ritmo', brief.pace],
    ['Intereses', brief.interests],
    ['Alojamiento o zona', brief.accommodation],
    ['Transporte previsto', brief.transport],
    ['Movilidad y accesibilidad', brief.accessibility],
    ['Alimentación', brief.food],
    ['Peticiones del viajero', brief.notes],
  ].map(([label, value]) => `- ${label}: ${value.trim() || 'Sin indicar'}`).join('\n');

  return `Actúa como planificador profesional de viajes y creador de documentos compatibles con TravelCaris.

INFORMACIÓN DISPONIBLE
${details}

FASE 1: ENTREVISTA
Antes de preparar el itinerario, revisa la información. Si faltan datos que afecten de verdad al resultado, haz una sola ronda de preguntas breves y agrupadas. No vuelvas a preguntar lo que ya está contestado. Pregunta especialmente por edades, horarios de llegada y salida, movilidad, presupuesto, reservas ya hechas, intereses prioritarios y ritmo si no están claros. No solicites pasaportes, localizadores, números de billete, datos bancarios ni otros secretos.

FASE 2: PLANIFICACIÓN
Cuando tengas las respuestas necesarias, crea un itinerario realista por días. Agrupa lugares cercanos, incluye tiempos de traslado, pausas y comidas, evita solapamientos y deja margen para imprevistos. Distingue datos confirmados de estimaciones. No inventes reservas, horarios, precios ni disponibilidad. Cuando puedas consultar internet, contrasta horarios y condiciones con fuentes oficiales e incluye sus enlaces. Añade alternativas para lluvia o cierres y ten en cuenta familias, accesibilidad, alimentación y presupuesto indicados.

FASE 3: DOCUMENTO FINAL
Entrega un archivo PDF descargable, en español, con diseño claro y texto seleccionable. Incluye primero una versión cómoda para leer: resumen del viaje, itinerario diario, alojamientos, vuelos, presupuesto orientativo, reservas pendientes y fuentes que conviene verificar.

Al final del PDF añade un anexo de texto en una sola columna. Debe comenzar exactamente por ${travelCarisAiFormat}. No uses tablas, viñetas, columnas ni saltos de línea dentro de un valor. Repite los bloques necesarios y no incluyas bloques vacíos. Usa fechas YYYY-MM-DD, horas HH:MM, coordenadas decimales y una de estas categorías exactas: Monumento, Museo, Restaurante, Cafetería, Parque, Tienda, Transporte, Alojamiento, Aeropuerto, Actividad infantil, Reserva, Mercado, Paseo, Tour, Free tour, Ocio, Espectáculo, Experiencia, Emergencia, Otros.

FORMATO EXACTO DEL ANEXO
${travelCarisAiFormat}
[VIAJE]
NOMBRE: Nombre del viaje
DESTINO: Ciudad o zona principal
PAIS: País
INICIO: YYYY-MM-DD
FIN: YYYY-MM-DD

[ALOJAMIENTO]
NOMBRE: Nombre sin referencia de reserva
DIRECCION: Dirección completa
INICIO: YYYY-MM-DD
FIN: YYYY-MM-DD
CHECK_IN: HH:MM
CHECK_OUT: HH:MM
TELEFONO: Teléfono público, si se conoce
LATITUD: Decimal, si se conoce con seguridad
LONGITUD: Decimal, si se conoce con seguridad
NOTAS: Una sola línea sin datos privados
[FIN_ALOJAMIENTO]

[ACTIVIDAD]
FECHA: YYYY-MM-DD
INICIO: HH:MM
FIN: HH:MM
TITULO: Nombre breve
CATEGORIA: Una categoría exacta de la lista
DIRECCION: Dirección o punto de encuentro
LATITUD: Decimal, si se conoce con seguridad
LONGITUD: Decimal, si se conoce con seguridad
DURACION_MIN: Número entero
DESCRIPCION: Una sola línea
NOTAS: Una sola línea
RESERVA: No necesaria, Recomendada, Necesaria, Pendiente o Reservada
ENLACE_OFICIAL: URL oficial
ENLACE_RESERVA: URL de reserva, si procede
PRECIO_TOTAL: Número sin símbolo
MONEDA: EUR o GBP
ENTORNO: Interior, Exterior, Mixto o Sin indicar
PLAN_LLUVIA: Una sola línea
ACCESIBILIDAD: Una sola línea
[FIN_ACTIVIDAD]

[VUELO]
COMPANIA: Aerolínea
NUMERO: Número de vuelo
FECHA: YYYY-MM-DD
ORIGEN: Aeropuerto de salida
ORIGEN_IATA: Código IATA
DESTINO: Aeropuerto de llegada
DESTINO_IATA: Código IATA
SALIDA: HH:MM
LLEGADA: HH:MM
ENLACE_OFICIAL: URL oficial de seguimiento
EQUIPAJE: Una sola línea, si se conoce
NOTAS: Una sola línea sin localizadores ni billetes
[FIN_VUELO]

[FIN_TRAVELCARIS]

Antes de entregar el PDF, comprueba que todas las actividades estén dentro de las fechas del viaje, que no existan horas imposibles ni bloques duplicados y que el anexo conserve exactamente estas etiquetas.`;
}

function dateRange(startDate: string, endDate: string) {
  if (!startDate && !endDate) return '';
  if (!endDate || endDate === startDate) return startDate;
  return `${startDate} a ${endDate}`;
}
