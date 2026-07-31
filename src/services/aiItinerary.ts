export interface AiItineraryBrief {
  destination: string;
  country: string;
  startDate: string;
  endDate: string;
  travellers: string;
  budget: string;
  destinationCurrency: string;
  travellerCurrency: string;
  pace: 'Tranquilo' | 'Equilibrado' | 'Intenso';
  interests: string;
  accommodation: string;
  transport: string;
  accessibility: string;
  food: string;
  completedPreparations: string;
  preparations: string;
  packing: string;
  notes: string;
}

export const travelCarisAiFormat = 'TRAVELCARIS-AI-PDF-V4';
export const previousTravelCarisAiFormat = 'TRAVELCARIS-AI-PDF-V3';
export const legacyTravelCarisAiFormat = 'TRAVELCARIS-AI-PDF-V2';
export const originalTravelCarisAiFormat = 'TRAVELCARIS-AI-PDF-V1';

export function buildAiItineraryPrompt(brief: AiItineraryBrief) {
  const details = [
    ['Destino', brief.destination],
    ['País', brief.country],
    ['Fechas', dateRange(brief.startDate, brief.endDate)],
    ['Viajeros', brief.travellers],
    ['Presupuesto', brief.budget],
    ['Moneda del destino', brief.destinationCurrency],
    ['Moneda del viajero', brief.travellerCurrency],
    ['Ritmo', brief.pace],
    ['Intereses', brief.interests],
    ['Alojamiento o zona', brief.accommodation],
    ['Transporte previsto', brief.transport],
    ['Movilidad y accesibilidad', brief.accessibility],
    ['Alimentación', brief.food],
    ['Preparativos y reservas ya completados', brief.completedPreparations],
    ['Preparativos o fechas que recordar', brief.preparations],
    ['Equipaje especial', brief.packing],
    ['Peticiones del viajero', brief.notes],
  ].map(([label, value]) => `- ${label}: ${value.trim() || 'Sin indicar'}`).join('\n');

  return `Actúa como planificador profesional de viajes y creador de documentos compatibles con TravelCaris.

INFORMACIÓN DISPONIBLE
${details}

FASE 1: ENTREVISTA
Antes de preparar el itinerario, revisa la información. Si faltan datos que afecten de verdad al resultado, haz una sola ronda de preguntas breves y agrupadas. No vuelvas a preguntar lo que ya está contestado. Pregunta especialmente por edades, horarios de llegada y salida, movilidad, presupuesto, reservas ya hechas, tareas ya completadas, intereses prioritarios y ritmo si no están claros. No solicites pasaportes, localizadores, números de billete, datos bancarios ni otros secretos.

Si el usuario adjunta un PDF anterior, úsalo como fuente principal: conserva todos sus datos útiles, corrige únicamente incoherencias verificables y migra el contenido completo al formato V4. No resumas ni omitas vuelos, alojamientos, traslados, actividades, alternativas, recordatorios, equipaje, precios, horarios, direcciones, coordenadas o fuentes presentes en el documento original.

FASE 2: PLANIFICACIÓN
Cuando tengas las respuestas necesarias, crea un itinerario realista por días. Agrupa lugares cercanos, incluye tiempos de traslado, pausas y comidas, evita solapamientos y deja margen para imprevistos. Distingue datos confirmados de estimaciones. No inventes reservas, horarios, precios, coordenadas ni disponibilidad. Cuando puedas consultar internet, contrasta direcciones, horarios y condiciones con fuentes oficiales e incluye sus enlaces. Obtén para cada alojamiento y actividad una latitud y longitud precisas del acceso o establecimiento, no del centro de la ciudad; si no puedes verificarlas, déjalas vacías para que TravelCaris intente ubicarlas. Añade alternativas para lluvia o cierres y ten en cuenta familias, accesibilidad, alimentación y presupuesto indicados.

FASE 3: DOCUMENTO FINAL
Entrega un archivo PDF descargable, en español, con diseño claro y texto seleccionable. Incluye primero una versión cómoda para leer: resumen del viaje, itinerario diario, alojamientos, vuelos, presupuesto orientativo, reservas pendientes y fuentes que conviene verificar.

ANEXO OBLIGATORIO PARA LA IMPORTACIÓN: al final del PDF añade el anexo de texto completo que se define abajo. Una portada, una tabla, tarjetas visuales o una mención a ${travelCarisAiFormat} no sustituyen este anexo. Si falta el marcador en una línea independiente, el bloque [VIAJE], todos los bloques de datos aplicables o [FIN_TRAVELCARIS], el PDF no es compatible y no debes entregarlo todavía.

El anexo debe ir en una sola columna y comenzar exactamente por ${travelCarisAiFormat} en una línea independiente, seguido inmediatamente por [VIAJE]. No uses tablas, viñetas, columnas, cabeceras, pies de página ni saltos de línea dentro de un valor. Repite los bloques necesarios y no incluyas bloques vacíos. Dentro de cada bloque conserva todas las claves del formato y deja vacío solo el valor que realmente no se conozca o no proceda. Usa fechas YYYY-MM-DD, horas HH:MM, coordenadas decimales y códigos de moneda ISO de tres letras. Conserva como completados los preparativos indicados por el viajero y no los conviertas en avisos pendientes. Incluye recordatorios solo cuando tengan una fecha útil y elementos de equipaje concretos, sin inventar necesidades. Representa vuelos en [VUELO] y otros traslados como [ACTIVIDAD] con CATEGORIA: Transporte. Usa una de estas categorías exactas: Monumento, Museo, Restaurante, Cafetería, Parque, Tienda, Transporte, Alojamiento, Aeropuerto, Actividad infantil, Reserva, Mercado, Paseo, Tour, Free tour, Ocio, Espectáculo, Experiencia, Emergencia, Otros.

FORMATO EXACTO DEL ANEXO
${travelCarisAiFormat}
[VIAJE]
NOMBRE: Nombre del viaje
DESTINO: Ciudad o zona principal
PAIS: País
INICIO: YYYY-MM-DD
FIN: YYYY-MM-DD
DESCRIPCION: Resumen inspirador y práctico en una sola línea
VIAJEROS: Personas separadas por punto y coma, sin datos privados
MONEDA_DESTINO: Código ISO de tres letras
MONEDA_VIAJERO: Código ISO de tres letras
PRESUPUESTO: Número sin símbolo en la moneda del destino

[ALOJAMIENTO]
NOMBRE: Nombre sin referencia de reserva
DIRECCION: Dirección completa
INICIO: YYYY-MM-DD
FIN: YYYY-MM-DD
CHECK_IN: HH:MM
CHECK_OUT: HH:MM
TELEFONO: Teléfono público, si se conoce
INSTRUCCIONES_ACCESO: Información pública útil, nunca códigos, llaves ni secretos
EQUIPAJE: Consigna o condiciones públicas de equipaje
ACTIVO: Si para el alojamiento principal en esas fechas; No para los demás
LATITUD: Decimal verificado del alojamiento; vacío si no puede comprobarse
LONGITUD: Decimal verificado del alojamiento; vacío si no puede comprobarse
NOTAS: Una sola línea sin datos privados
[FIN_ALOJAMIENTO]

[ACTIVIDAD]
FECHA: YYYY-MM-DD
INICIO: HH:MM
FIN: HH:MM
TITULO: Nombre breve
CATEGORIA: Una categoría exacta de la lista
PLAN: Principal o Alternativa
ESTADO: Pendiente, Confirmado, Reservado, En curso, Realizado, Cancelado o Alternativa
PRIORIDAD: Baja, Media, Alta o Premium
DIRECCION: Dirección o punto de encuentro
LATITUD: Decimal verificado del acceso o lugar; vacío si no puede comprobarse
LONGITUD: Decimal verificado del acceso o lugar; vacío si no puede comprobarse
DURACION_MIN: Número entero
DESCRIPCION: Una sola línea
NOTAS: Una sola línea
TELEFONO: Teléfono público del lugar, si existe
HORARIO_APERTURA: Horario aplicable al día de la visita en una sola línea
HORARIO_ESPECIAL: Cierres o condiciones especiales para la fecha
RESERVA: No necesaria, Recomendada, Necesaria, Pendiente o Reservada
PLAZO_RESERVA: Fecha límite o antelación recomendada, sin inventar
CANCELACION: Condiciones públicas relevantes en una sola línea
PUNTO_ENCUENTRO: Punto exacto si es distinto de la dirección
ENLACE_OFICIAL: URL oficial
ENLACE_RESERVA: URL de reserva, si procede
FUENTE_NOMBRE: Nombre de la fuente consultada
FUENTE_URL: URL concreta que respalda los datos
VERIFICACION: Verificado, Pendiente de verificar o Fuente no oficial
FECHA_VERIFICACION: YYYY-MM-DD si se ha comprobado
NOTA_VERIFICACION: Qué se verificó o qué queda pendiente
PRECIO_TIPO: Gratis, Precio fijo, Desde, Aproximado, Donativo o Desconocido
PRECIO_ADULTO: Número sin símbolo
PRECIO_NINO: Número sin símbolo
PRECIO_BEBE: Número sin símbolo
PRECIO_FAMILIA: Número sin símbolo
PRECIO_TOTAL: Número sin símbolo para el grupo indicado
MONEDA: Código ISO de tres letras
PRECIO_UNIDAD: persona, familia o actividad
NOTA_PRECIO: Qué incluye el precio y posibles condiciones
ENTORNO: Interior, Exterior, Mixto o Sin indicar
PLAN_LLUVIA: Una sola línea
ACCESIBILIDAD: Una sola línea
CARRITO: Si o No
FAMILIAR: Si o No
EDAD_MINIMA: Edad o restricción, si existe
TOUR_PROVEEDOR: Empresa u organizador, solo para tours
TOUR_IDIOMA: Idioma, solo para tours
TOUR_TIPO: Tipo de tour, solo para tours
PROPINA: Orientación pública, solo para free tours
COCINA: Tipo de cocina, solo para restaurantes
TIPO_COMIDA: Desayuno, comida, cena o tentempié
OPCIONES_ALIMENTARIAS: Alergias o preferencias cubiertas
PLATAFORMA_RESERVA: Plataforma pública, sin referencias privadas
TIPO_OCIO: Tipo de actividad de ocio o espectáculo
SESION: Hora o sesión aplicable
RECINTO: Nombre del recinto
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
TERMINAL_SALIDA: Terminal conocida, vacía si no está publicada
TERMINAL_LLEGADA: Terminal conocida, vacía si no está publicada
ESTADO: Programado o Confirmado; no inventar estados operativos futuros
ENLACE_OFICIAL: URL oficial de seguimiento
EQUIPAJE: Una sola línea, si se conoce
NOTAS: Una sola línea sin localizadores ni billetes
[FIN_VUELO]

[RECORDATORIO]
TITULO: Acción concreta que debe recordarse
FECHA: YYYY-MM-DD
HORA: HH:MM
NOTAS: Una sola línea
COMPLETADO: Si o No
[FIN_RECORDATORIO]

[EQUIPAJE]
LISTA: Equipaje, Documentación, Medicamentos, Bebé, Niños, Tecnología, Antes de salir o Durante el viaje
ELEMENTO: Objeto o tarea concreta
PERSONA: Persona responsable, si se conoce
CANTIDAD: Número entero positivo
NOTAS: Una sola línea
PREPARADO: Si o No
[FIN_EQUIPAJE]

[FIN_TRAVELCARIS]

COMPROBACIÓN FINAL OBLIGATORIA: antes de entregar el PDF, extrae o revisa su texto final y confirma que contiene, como líneas independientes, ${travelCarisAiFormat}, [VIAJE], al menos un bloque [ACTIVIDAD] cuando exista itinerario, cada [ALOJAMIENTO] y [VUELO] aplicable, y [FIN_TRAVELCARIS]. Comprueba además que cada lugar identificable tenga dirección completa y coordenadas verificadas, que cada actividad tenga su estado y fecha de verificación, que lo ya realizado figure como completado, que todas las actividades y recordatorios estén dentro de un intervalo razonable para el viaje y que no existan horas imposibles ni bloques duplicados. Si la comprobación falla, corrige y vuelve a generar el PDF antes de proporcionarlo.`;
}

export function buildAiPdfRegenerationPrompt(brief: AiItineraryBrief) {
  return `Te adjunto mi PDF actual del viaje. Analízalo completo y regénéralo sin perder información útil. Mantén los datos confirmados, corrige únicamente incoherencias verificables y transforma todo el contenido al contrato TRAVELCARIS-AI-PDF-V4 indicado a continuación. Si para completar correctamente el documento necesitas información que no aparece en el PDF ni en estas instrucciones, hazme una sola ronda de preguntas antes de generar el archivo. No incluyas localizadores, billetes, pasaportes, códigos de acceso ni datos bancarios.

${buildAiItineraryPrompt(brief)}`;
}

function dateRange(startDate: string, endDate: string) {
  if (!startDate && !endDate) return '';
  if (!endDate || endDate === startDate) return startDate;
  return `${startDate} a ${endDate}`;
}
