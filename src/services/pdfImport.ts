import type { Accommodation, Activity, Flight, Trip } from '../domain/types';
import { categories } from '../domain/types';
import { travelCarisAiFormat } from './aiItinerary';

export interface PdfImportDraft {
  fileName: string;
  trip: Pick<Trip, 'name' | 'destination' | 'country' | 'startDate' | 'endDate'>;
  activities: Array<Partial<Activity> & Pick<Activity, 'title' | 'day'>>;
  accommodations: Array<Omit<Accommodation, 'id' | 'tripId' | 'createdAt' | 'updatedAt'>>;
  flights: Array<Partial<Flight> & Pick<Flight, 'flightNumber' | 'scheduledDate'>>;
  warnings: string[];
  sourceFormat?: 'travelcaris-ai-v1' | 'general';
}

const months: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
  JANUARY: 1,
  FEBRUARY: 2,
  MARCH: 3,
  APRIL: 4,
  JUNE: 6,
  JULY: 7,
  AUGUST: 8,
  SEPTEMBER: 9,
  OCTOBER: 10,
  NOVEMBER: 11,
  DECEMBER: 12,
};

const countryByDestination: Record<string, string> = {
  LONDRES: 'Reino Unido',
  LONDON: 'Reino Unido',
  PARIS: 'Francia',
  PARÍS: 'Francia',
  ROMA: 'Italia',
  ROME: 'Italia',
  LISBOA: 'Portugal',
  LISBON: 'Portugal',
  MADRID: 'España',
  BARCELONA: 'España',
  DUBLIN: 'Irlanda',
  DUBLÍN: 'Irlanda',
};

const airportCodes: Record<string, string> = {
  ALICANTE: 'ALC',
  GATWICK: 'LGW',
  LUTON: 'LTN',
  HEATHROW: 'LHR',
  STANSTED: 'STN',
  BARAJAS: 'MAD',
  MADRID: 'MAD',
  'CHARLES DE GAULLE': 'CDG',
  ORLY: 'ORY',
  FIUMICINO: 'FCO',
};

const airportOfficialUrls: Record<string, string> = {
  ALC: 'https://www.aena.es/es/alicante-elche-miguel-hernandez/vuelos.html',
  LGW: 'https://www.gatwickairport.com/flights/',
  LTN: 'https://www.london-luton.co.uk/flights',
  LHR: 'https://www.heathrow.com/arrivals',
  STN: 'https://www.stanstedairport.com/flight-information/',
  MAD: 'https://www.aena.es/es/adolfo-suarez-madrid-barajas/vuelos.html',
  CDG: 'https://www.parisaeroport.fr/en/passengers/flights',
  ORY: 'https://www.parisaeroport.fr/en/passengers/flights',
  FCO: 'https://www.adr.it/web/aeroporti-di-roma-en/flights',
};

export async function extractPdfPages(file: File): Promise<string[]> {
  if (!file.size) throw new Error('El archivo está vacío o todavía no se ha descargado desde iCloud. Descárgalo en Archivos y vuelve a seleccionarlo.');
  if (file.size > 20 * 1024 * 1024) throw new Error('El PDF supera el límite de 20 MB.');

  const data = await readFileBytes(file);
  const signature = new TextDecoder('ascii').decode(data.slice(0, 1024));
  if (!signature.includes('%PDF-')) throw new Error('El archivo seleccionado no contiene un PDF válido.');

  const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;
  const loadingTask = getDocument({ data, isEvalSupported: false });
  try {
    const document = await loadingTask.promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .filter((item): item is typeof item & { str: string } => 'str' in item)
          .map((item) => item.str.trim())
          .filter(Boolean)
          .join('\n'),
      );
      page.cleanup();
    }

    return pages;
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '';
    if (/password/i.test(message)) throw pdfReadError('El PDF está protegido con contraseña. Guarda una copia sin contraseña e inténtalo de nuevo.', reason);
    if (/invalid|malformed|corrupt/i.test(message)) throw pdfReadError('El PDF está dañado o utiliza un formato no compatible. Prueba a imprimirlo o exportarlo de nuevo como PDF.', reason);
    const detail = message.trim().replace(/\s+/g, ' ').slice(0, 160);
    throw pdfReadError(
      `El lector local no pudo analizar este PDF${detail ? ` (${detail})` : ''}. Prueba a guardarlo de nuevo como PDF o a importarlo desde Archivos.`,
      reason,
    );
  } finally {
    await loadingTask.destroy();
  }
}

function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo abrir el archivo seleccionado.'));
    reader.onabort = () => reject(new Error('La lectura del archivo se canceló.'));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(new Uint8Array(reader.result));
      else reject(new Error('El navegador no pudo entregar el contenido del archivo.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

function pdfReadError(message: string, cause: unknown) {
  const error = new Error(message) as Error & { cause?: unknown };
  error.cause = cause;
  return error;
}

export async function parseTravelPdf(file: File): Promise<PdfImportDraft> {
  const pages = await extractPdfPages(file);
  return parseTravelDocumentText(pages, file.name);
}

export function parseTravelDocumentText(pages: string[], fileName = 'viaje.pdf'): PdfImportDraft {
  const lines = pages.flatMap((page) => page.split(/\r?\n/).map(cleanLine).filter(Boolean));
  const fullText = lines.join('\n');
  if (fullText.replace(/\s/g, '').length < 80) {
    throw new Error('No se ha encontrado texto suficiente. El PDF puede estar escaneado o protegido.');
  }

  const structuredDraft = parseTravelCarisAiDocument(lines, fileName);
  if (structuredDraft) return structuredDraft;

  const range = detectDateRange(lines);
  const destination = detectDestination(lines);
  const warnings: string[] = [];
  if (!range) warnings.push('No se detectó con seguridad el intervalo de fechas. Revísalo antes de importar.');
  if (!destination) warnings.push('No se detectó con seguridad el destino. Revísalo antes de importar.');

  const fallbackDate = new Date().toISOString().slice(0, 10);
  const startDate = range?.startDate ?? fallbackDate;
  const endDate = range?.endDate ?? startDate;
  const safeDestination = destination || 'Destino por revisar';
  const activities = detectActivities(lines, startDate);
  const accommodations = detectAccommodations(lines, startDate, endDate);
  const flights = detectFlights(fullText, startDate);

  if (!activities.length) warnings.push('No se detectaron filas de itinerario con hora. Podrás añadir actividades manualmente.');
  if (!accommodations.length) warnings.push('No se detectaron alojamientos.');
  if (!flights.length) warnings.push('No se detectaron vuelos con número, fecha y horario.');

  return {
    fileName,
    trip: {
      name: `Viaje a ${safeDestination}`,
      destination: safeDestination,
      country: inferCountry(safeDestination),
      startDate,
      endDate,
    },
    activities,
    accommodations,
    flights,
    warnings,
    sourceFormat: 'general',
  };
}

export function validatePdfImportDraft(draft: PdfImportDraft) {
  const errors: string[] = [];
  if (!draft.trip.name?.trim()) errors.push('Falta el nombre del viaje.');
  if (!draft.trip.destination?.trim()) errors.push('Falta el destino.');
  if (!validIsoDate(draft.trip.startDate) || !validIsoDate(draft.trip.endDate) || draft.trip.endDate < draft.trip.startDate) {
    errors.push('Las fechas del viaje no son válidas.');
  }
  if (draft.activities.length > 500 || draft.accommodations.length > 50 || draft.flights.length > 50) {
    errors.push('El PDF contiene más elementos de los que se pueden importar con seguridad.');
  }
  if (!draft.activities.length && !draft.accommodations.length && !draft.flights.length) {
    errors.push('El PDF no contiene actividades, alojamientos ni vuelos para importar.');
  }
  draft.activities.forEach((activity, index) => {
    if (!activity.title?.trim()) errors.push(`La actividad ${index + 1} no tiene título.`);
    if (!validIsoDate(activity.day) || activity.day < draft.trip.startDate || activity.day > draft.trip.endDate) {
      errors.push(`La actividad ${index + 1} está fuera de las fechas del viaje.`);
    }
    if (activity.startTime && !validTime(activity.startTime)) errors.push(`La actividad ${index + 1} tiene una hora no válida.`);
  });
  draft.accommodations.forEach((accommodation, index) => {
    if (!accommodation.name?.trim()) errors.push(`El alojamiento ${index + 1} no tiene nombre.`);
    if (!validIsoDate(accommodation.startDate) || !validIsoDate(accommodation.endDate) || accommodation.endDate < accommodation.startDate) {
      errors.push(`El alojamiento ${index + 1} tiene fechas no válidas.`);
    }
  });
  draft.flights.forEach((flight, index) => {
    if (!flight.flightNumber?.trim()) errors.push(`El vuelo ${index + 1} no tiene número.`);
    if (!validIsoDate(flight.scheduledDate)) errors.push(`El vuelo ${index + 1} tiene una fecha no válida.`);
  });
  return [...new Set(errors)];
}

interface StructuredSection {
  name: string;
  fields: Record<string, string>;
}

function parseTravelCarisAiDocument(lines: string[], fileName: string): PdfImportDraft | null {
  const markerIndex = lines.findIndex((line) => fold(line).toUpperCase() === travelCarisAiFormat);
  if (markerIndex < 0) return null;

  const sections = structuredSections(lines.slice(markerIndex + 1));
  const tripSection = sections.find((section) => section.name === 'VIAJE');
  if (!tripSection) throw new Error('El anexo de TravelCaris no contiene el bloque [VIAJE].');

  const warnings: string[] = [];
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const destination = field(tripSection, 'DESTINO') || 'Destino por revisar';
  const startDate = validIsoDate(field(tripSection, 'INICIO')) ? field(tripSection, 'INICIO') : fallbackDate;
  const endCandidate = field(tripSection, 'FIN');
  const endDate = validIsoDate(endCandidate) && endCandidate >= startDate ? endCandidate : startDate;
  if (!validIsoDate(field(tripSection, 'INICIO')) || !validIsoDate(endCandidate)) {
    warnings.push('El anexo estructurado no incluía fechas válidas. Revísalas antes de importar.');
  }

  const activities = sections
    .filter((section) => section.name === 'ACTIVIDAD')
    .map((section) => structuredActivity(section, startDate))
    .filter((activity): activity is PdfImportDraft['activities'][number] => Boolean(activity));
  const accommodations = sections
    .filter((section) => section.name === 'ALOJAMIENTO')
    .map((section, index) => structuredAccommodation(section, startDate, endDate, index === 0))
    .filter((accommodation): accommodation is PdfImportDraft['accommodations'][number] => Boolean(accommodation));
  const flights = sections
    .filter((section) => section.name === 'VUELO')
    .map((section) => structuredFlight(section, startDate))
    .filter((flight): flight is PdfImportDraft['flights'][number] => Boolean(flight));

  if (!activities.length) warnings.push('El anexo no contiene actividades válidas.');
  if (activities.some((activity) => activity.day < startDate || activity.day > endDate)) {
    warnings.push('Hay actividades fuera de las fechas del viaje. Corrígelas en la vista previa.');
  }
  if (!accommodations.length) warnings.push('El anexo no contiene alojamientos.');
  if (!flights.length) warnings.push('El anexo no contiene vuelos.');

  return {
    fileName,
    trip: {
      name: field(tripSection, 'NOMBRE') || `Viaje a ${destination}`,
      destination,
      country: field(tripSection, 'PAIS') || inferCountry(destination),
      startDate,
      endDate,
    },
    activities: uniqueBy(activities, (item) => `${item.day}|${item.startTime}|${fold(item.title)}`),
    accommodations: uniqueBy(accommodations, (item) => `${fold(item.name)}|${fold(item.address)}`),
    flights: uniqueBy(flights, (item) => `${item.flightNumber}|${item.scheduledDate}`),
    warnings,
    sourceFormat: 'travelcaris-ai-v1',
  };
}

function structuredSections(lines: string[]) {
  const sections: StructuredSection[] = [];
  let current: StructuredSection | null = null;
  let lastKey = '';

  const finish = () => {
    if (current) sections.push(current);
    current = null;
    lastKey = '';
  };

  for (const line of lines) {
    const sectionMatch = line.match(/^\[([A-Z_]+)\]$/i);
    if (sectionMatch) {
      const name = sectionMatch[1].toUpperCase();
      if (name.startsWith('FIN_')) {
        finish();
        if (name === 'FIN_TRAVELCARIS') break;
      } else {
        finish();
        current = { name, fields: {} };
      }
      continue;
    }
    if (!current) continue;
    const fieldMatch = line.match(/^([\p{L}_ ]{2,32}):\s*(.*)$/u);
    if (fieldMatch) {
      lastKey = fieldKey(fieldMatch[1]);
      current.fields[lastKey] = cleanLine(fieldMatch[2]);
    } else if (lastKey) {
      current.fields[lastKey] = cleanLine(`${current.fields[lastKey]} ${line}`);
    }
  }
  finish();
  return sections;
}

function structuredActivity(section: StructuredSection, fallbackDate: string): PdfImportDraft['activities'][number] | null {
  const title = field(section, 'TITULO');
  if (!title) return null;
  const categoryValue = field(section, 'CATEGORIA');
  const category = categories.find((item) => fold(item).toUpperCase() === fold(categoryValue).toUpperCase()) ?? inferCategory(`${title} ${categoryValue}`);
  const currency = field(section, 'MONEDA').toUpperCase() === 'GBP' ? 'GBP' : 'EUR';
  const total = positiveNumber(field(section, 'PRECIO_TOTAL'));
  const reservation = reservationStatus(field(section, 'RESERVA'));
  const lat = coordinate(field(section, 'LATITUD'), -90, 90);
  const lng = coordinate(field(section, 'LONGITUD'), -180, 180);

  return {
    title,
    description: field(section, 'DESCRIPCION'),
    day: validIsoDate(field(section, 'FECHA')) ? field(section, 'FECHA') : fallbackDate,
    startTime: validTime(field(section, 'INICIO')) ? field(section, 'INICIO') : '10:00',
    endTime: validTime(field(section, 'FIN')) ? field(section, 'FIN') : '',
    estimatedDurationMinutes: positiveInteger(field(section, 'DURACION_MIN')) || 60,
    category,
    address: field(section, 'DIRECCION'),
    lat,
    lng,
    notes: field(section, 'NOTAS'),
    reservationRequired: ['Necesaria', 'Pendiente', 'Reservada'].includes(reservation),
    reservationDone: reservation === 'Reservada',
    reservationStatus: reservation,
    reservationLink: safeHttpUrl(field(section, 'ENLACE_RESERVA')),
    officialLink: safeHttpUrl(field(section, 'ENLACE_OFICIAL')),
    status: 'Pendiente',
    sourceName: 'PDF preparado para TravelCaris',
    sourceUrl: safeHttpUrl(field(section, 'ENLACE_OFICIAL')),
    verificationStatus: 'Pendiente de verificar',
    verificationNote: 'Comprueba horarios, precios y reservas en la fuente oficial.',
    priceDetails: {
      kind: total ? 'Aproximado' : 'Desconocido',
      adult: 0,
      child: 0,
      baby: 0,
      family: 0,
      totalEstimate: total,
      currency,
      unit: 'actividad',
      note: total ? 'Estimación incluida en el PDF.' : '',
    },
    estimatedTotalPrice: total,
    currency,
    environment: environment(field(section, 'ENTORNO')),
    rainPlan: field(section, 'PLAN_LLUVIA'),
    accessibility: field(section, 'ACCESIBILIDAD'),
  };
}

function structuredAccommodation(
  section: StructuredSection,
  fallbackStart: string,
  fallbackEnd: string,
  active: boolean,
): PdfImportDraft['accommodations'][number] | null {
  const name = field(section, 'NOMBRE');
  if (!name) return null;
  return {
    name,
    address: field(section, 'DIRECCION'),
    phone: field(section, 'TELEFONO'),
    checkIn: validTime(field(section, 'CHECK_IN')) ? field(section, 'CHECK_IN') : '',
    checkOut: validTime(field(section, 'CHECK_OUT')) ? field(section, 'CHECK_OUT') : '',
    startDate: validIsoDate(field(section, 'INICIO')) ? field(section, 'INICIO') : fallbackStart,
    endDate: validIsoDate(field(section, 'FIN')) ? field(section, 'FIN') : fallbackEnd,
    entryInstructions: '',
    luggageNotes: '',
    notes: field(section, 'NOTAS'),
    lat: coordinate(field(section, 'LATITUD'), -90, 90),
    lng: coordinate(field(section, 'LONGITUD'), -180, 180),
    images: [],
    active,
  };
}

function structuredFlight(section: StructuredSection, fallbackDate: string): PdfImportDraft['flights'][number] | null {
  const flightNumber = field(section, 'NUMERO').replace(/\s/g, '').toUpperCase();
  if (!flightNumber) return null;
  const departureIata = field(section, 'ORIGEN_IATA').toUpperCase();
  const arrivalIata = field(section, 'DESTINO_IATA').toUpperCase();
  return {
    airline: field(section, 'COMPANIA'),
    airlineIata: flightNumber.match(/^[A-Z0-9]{2,3}/)?.[0] ?? '',
    flightNumber,
    scheduledDate: validIsoDate(field(section, 'FECHA')) ? field(section, 'FECHA') : fallbackDate,
    departureAirport: field(section, 'ORIGEN'),
    departureIata,
    arrivalAirport: field(section, 'DESTINO'),
    arrivalIata,
    scheduledDepartureTime: validTime(field(section, 'SALIDA')) ? field(section, 'SALIDA') : '',
    scheduledArrivalTime: validTime(field(section, 'LLEGADA')) ? field(section, 'LLEGADA') : '',
    status: 'Programado',
    includedBaggage: field(section, 'EQUIPAJE'),
    notes: field(section, 'NOTAS'),
    officialTrackingUrl: safeHttpUrl(field(section, 'ENLACE_OFICIAL')) || inferAirlineUrl(flightNumber),
    departureAirportUrl: airportOfficialUrls[departureIata] ?? '',
    arrivalAirportUrl: airportOfficialUrls[arrivalIata] ?? '',
  };
}

function detectDateRange(lines: string[]) {
  for (const line of lines.slice(0, 40)) {
    const normalized = fold(line).toUpperCase();
    const match = normalized.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(?:DE\s+)?([A-Z]+)\s+(?:DE\s+)?(\d{4})\b/);
    if (!match) continue;
    const month = months[match[3]];
    if (!month) continue;
    return {
      startDate: isoDate(Number(match[4]), month, Number(match[1])),
      endDate: isoDate(Number(match[4]), month, Number(match[2])),
    };
  }
  return null;
}

function detectDestination(lines: string[]) {
  for (const line of lines.slice(0, 25)) {
    const match = line.match(/^([\p{L}][\p{L} .'-]{1,40})\s+EN\s+FAMILIA\b/iu);
    if (match) return titleCase(match[1]);
  }
  const destinationLine = lines.find((line) => /^(?:DESTINO|DESTINATION)\s*:/i.test(fold(line)));
  return destinationLine ? titleCase(destinationLine.split(':').slice(1).join(':')) : '';
}

function detectAccommodations(lines: string[], startDate: string, endDate: string): PdfImportDraft['accommodations'] {
  const results: PdfImportDraft['accommodations'] = [];
  const now = new Date().toISOString();

  for (let index = 0; index < lines.length; index += 1) {
    const columns = lines[index].split(/\s*\|\|\s*/).filter(Boolean);
    if (columns.length > 1 && columns.every((column) => /^(?:ALOJAMIENTO|HOTEL)(?:\s+\d+)?$/i.test(fold(column)))) {
      const detailRows = lines.slice(index + 1, index + 3).map((line) => line.split(/\s*\|\|\s*/));
      columns.forEach((column, columnIndex) => {
        const ordinal = fold(column).match(/(\d+)/)?.[1] ?? String(results.length + 1);
        const details = detailRows.map((row) => cleanLine(row[columnIndex] ?? '')).filter(Boolean);
        const detailedName = /^(?:hotel|hostal|apartamento|apartment)\b/i.test(fold(details[0] ?? ''))
          ? details.shift()
          : '';
        if (details.length || detailedName) {
          results.push(accommodationDraft(detailedName || `Alojamiento ${ordinal}`, details.join(', '), startDate, endDate, results.length === 0, now));
        }
      });
      index += 2;
      continue;
    }
    const label = fold(lines[index]).toUpperCase();
    const match = label.match(/^(?:ALOJAMIENTO|HOTEL)(?:\s+(\d+))?(?:\s*:\s*(.+))?$/);
    if (!match) continue;
    const details: string[] = [];
    for (let next = index + 1; next < Math.min(index + 4, lines.length); next += 1) {
      const candidate = lines[next];
      const folded = fold(candidate).toUpperCase();
      if (/^(?:ALOJAMIENTO|RECOMENDACION|RESUMEN|DIA\s+\d+)/.test(folded)) break;
      if (/^ZONA\s+IDEAL\b/.test(folded)) break;
      details.push(candidate);
      if (details.length === 2) break;
    }
    const inlineName = match[2]?.trim();
    if (!inlineName && !details.length) continue;
    const ordinal = match[1] || String(results.length + 1);
    const detailedName = !inlineName && /^(?:hotel|hostal|apartamento|apartment)\b/i.test(fold(details[0] ?? ''))
      ? details.shift()
      : '';
    results.push(accommodationDraft(inlineName || detailedName || `Alojamiento ${ordinal}`, details.join(', '), startDate, endDate, results.length === 0, now));
  }
  return uniqueBy(results, (item) => `${fold(item.name)}|${fold(item.address)}`);
}

function detectFlights(text: string, startDate: string): PdfImportDraft['flights'] {
  const results: PdfImportDraft['flights'] = [];
  const compact = text.replace(/\s+/g, ' ');
  const pattern = /(?:LLEGADA|REGRESO|IDA|VUELTA|RETURN|ARRIVAL)\s*:\s*([\p{L}][\p{L} .'-]{1,24})\s+([A-Z0-9]{2,3}\s?\d{2,4})\s*,\s*([\p{L} .'-]{2,40}?)\s*[-–]\s*([\p{L} .'-]{2,40}?)\s*,\s*(?:[\p{L}]+\s+)?(\d{1,2})\s+(?:DE\s+)?([\p{L}]+)(?:\s+(?:DE\s+)?(\d{4}))?[^()]*(?:\(|\b)(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})(?:\)|\b)/giu;
  const fallback = parseIso(startDate);

  for (const match of compact.matchAll(pattern)) {
    const month = months[fold(match[6]).toUpperCase()] ?? fallback.month;
    const year = Number(match[7]) || fallback.year;
    const flightNumber = match[2].replace(/\s/g, '').toUpperCase();
    const origin = cleanLine(match[3]);
    const destination = cleanLine(match[4]);
    const departureIata = inferAirportCode(origin);
    const arrivalIata = inferAirportCode(destination);
    results.push({
      airline: cleanLine(match[1]),
      airlineIata: flightNumber.match(/^[A-Z0-9]{2,3}/)?.[0] ?? '',
      flightNumber,
      scheduledDate: isoDate(year, month, Number(match[5])),
      departureAirport: origin,
      departureIata,
      arrivalAirport: destination,
      arrivalIata,
      scheduledDepartureTime: match[8],
      scheduledArrivalTime: match[9],
      status: 'Programado',
      notes: 'Importado localmente desde PDF. Verifica los datos en la fuente oficial.',
      officialTrackingUrl: inferAirlineUrl(flightNumber),
      departureAirportUrl: airportOfficialUrls[departureIata] ?? '',
      arrivalAirportUrl: airportOfficialUrls[arrivalIata] ?? '',
    });
  }
  return uniqueBy(results, (item) => `${item.flightNumber}|${item.scheduledDate}`);
}

function detectActivities(lines: string[], startDate: string): PdfImportDraft['activities'] {
  const activities: PdfImportDraft['activities'] = [];
  const base = parseIso(startDate);
  let currentDay = '';
  let pending: { time: string; fragments: string[] } | null = null;

  const finishPending = () => {
    if (!pending || !currentDay || !pending.fragments.length) {
      pending = null;
      return;
    }
    const description = pending.fragments.join(' ').replace(/\s+/g, ' ').trim().slice(0, 700);
    const title = activityTitle(description);
    if (title.length >= 3) {
      const price = detectPrice(description);
      activities.push({
        title,
        description,
        day: currentDay,
        startTime: pending.time,
        category: inferCategory(title),
        address: placeLikeTitle(title),
        reservationRequired: /\b(?:RESERVAR|RESERVA NECESARIA|BOOKING REQUIRED)\b/i.test(fold(description)),
        reservationStatus: /\b(?:RESERVAR|RESERVA NECESARIA|BOOKING REQUIRED)\b/i.test(fold(description)) ? 'Pendiente' : 'No necesaria',
        status: 'Pendiente',
        sourceName: 'PDF importado localmente',
        verificationStatus: 'Pendiente de verificar',
        verificationNote: 'Comprueba horarios, precios y reservas en la fuente oficial.',
        priceDetails: price,
        adultPrice: price.adult,
        estimatedTotalPrice: price.totalEstimate,
        currency: price.currency,
      });
    }
    pending = null;
  };

  for (const line of lines) {
    const rowText = line.replace(/\s*\|\|\s*/g, ' ');
    const normalized = fold(rowText).toUpperCase();
    const dayHeading = normalized.match(/^DIA\s+\d+\s*[·:.-]+\s*(?:LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO)\s+(\d{1,2})(?:\s+DE\s+([A-Z]+))?/);
    if (dayHeading) {
      finishPending();
      currentDay = isoDate(base.year, dayHeading[2] ? months[dayHeading[2]] ?? base.month : base.month, Number(dayHeading[1]));
      continue;
    }
    if (/^\d+\.\s+(?:COMER|COMPRAS|CONSEJOS|LISTA|QUE RESERVAR)/.test(normalized)) {
      finishPending();
      currentDay = '';
      continue;
    }
    if (!currentDay || isPdfFurniture(normalized)) continue;
    const timed = rowText.match(/^(\d{1,2}:\d{2})(?:\s+(.+))?$/);
    if (timed) {
      finishPending();
      pending = { time: timed[1].padStart(5, '0'), fragments: timed[2] ? [timed[2]] : [] };
      continue;
    }
    if (pending && pending.fragments.length < 4 && !isSectionHeading(line)) pending.fragments.push(line);
    else if (pending) finishPending();
  }
  finishPending();
  return uniqueBy(activities, (item) => `${item.day}|${item.startTime}|${fold(item.title)}`);
}

function detectPrice(text: string): NonNullable<Activity['priceDetails']> {
  const free = /\bGRATIS\b/i.test(fold(text));
  const amounts = [...text.matchAll(/[£€]\s*(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*[£€]?\s*(\d+(?:[.,]\d+)?))?/g)];
  const first = amounts[0];
  const low = first ? Number(first[1].replace(',', '.')) : 0;
  const high = first?.[2] ? Number(first[2].replace(',', '.')) : low;
  const estimate = low && high ? (low + high) / 2 : low;
  const currency = text.includes('£') ? 'GBP' : 'EUR';
  return {
    kind: free ? 'Gratis' : estimate ? 'Aproximado' : 'Desconocido',
    adult: /\b(?:ADULTO|PERSONA)\b/i.test(fold(text)) ? estimate : 0,
    child: 0,
    baby: 0,
    family: /\bFAMILIA\b/i.test(fold(text)) ? estimate : 0,
    totalEstimate: /\bFAMILIA\b/i.test(fold(text)) ? estimate : 0,
    currency,
    unit: /\bFAMILIA\b/i.test(fold(text)) ? 'familia' : 'persona',
    note: free ? 'El PDF indica que es gratis.' : estimate ? 'Precio orientativo detectado en el PDF.' : '',
  };
}

function accommodationDraft(
  name: string,
  address: string,
  startDate: string,
  endDate: string,
  active: boolean,
  importedAt: string,
): PdfImportDraft['accommodations'][number] {
  return {
    name,
    address,
    phone: '',
    checkIn: '',
    checkOut: '',
    startDate,
    endDate,
    entryInstructions: '',
    luggageNotes: '',
    notes: `Importado localmente desde PDF el ${importedAt.slice(0, 10)}.`,
    images: [],
    active,
  };
}

function inferCategory(value: string): Activity['category'] {
  const text = fold(value).toUpperCase();
  if (/VUELO|AEROPUERTO|TREN|METRO|TAXI|AUTOBUS|TRASLADO|BARCO/.test(text)) return 'Transporte';
  if (/HOTEL|ALOJAMIENTO|APARTAMENTO|CHECK-IN/.test(text)) return 'Alojamiento';
  if (/DESAYUNO|COMIDA|CENA|RESTAURANTE|PIZZA|CAFE|PICNIC/.test(text)) return 'Restaurante';
  if (/MUSEO|MUSEUM|GALERIA|GALLERY/.test(text)) return 'Museo';
  if (/PARQUE|PARK|JARDIN/.test(text)) return 'Parque';
  if (/MERCADO|MARKET/.test(text)) return 'Mercado';
  if (/TOUR/.test(text)) return text.includes('FREE') ? 'Free tour' : 'Tour';
  if (/TIENDA|SHOPPING|COMPRAS/.test(text)) return 'Tienda';
  if (/PALACIO|TORRE|CATEDRAL|ABADIA|CASTILLO|MONUMENTO/.test(text)) return 'Monumento';
  if (/PASEO|EXTERIOR|BARRIO|PLAZA/.test(text)) return 'Paseo';
  return 'Otros';
}

function activityTitle(value: string) {
  const sentence = value.split(/(?<=[.!?])\s+/)[0];
  return sentence
    .split(/\s+(?=Gratis\b|Pago\b|TfL\b|[£€]\s*\d|Reserva\s+(?:aconsejada|gratuita|necesaria)\b)/i)[0]
    .replace(/[.;,:\s-]+$/, '')
    .trim()
    .slice(0, 150);
}

function placeLikeTitle(value: string) {
  if (/^(?:desayuno|comida|cena|recoger|dejar|salida|llegada|traslado)/i.test(fold(value))) return '';
  return value.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

function isPdfFurniture(value: string) {
  return /^(?:HORA|PLAN|HORA\s+PLAN|GUIA PERSONALIZADA.*|[A-Z ]+ EN FAMILIA\s*[·-]\s*\d.*|COSTE\s*\/\s*RESERVA|NOTAS FAMILIARES)$/.test(value);
}

function isSectionHeading(value: string) {
  const normalized = fold(value).toUpperCase();
  return /^(?:PLAN DE LLUVIA|NO AGOTEIS|VERSION GRATUITA|LONDON EYE:|TOWER OF LONDON:|CAMBIO DE GUARDIA|RESERVAR\b|HORARIOS?\b|INFORMACION OFICIAL)/.test(normalized);
}

function inferCountry(destination: string) {
  return countryByDestination[destination.toUpperCase()] ?? '';
}

function inferAirportCode(name: string) {
  const explicit = name.match(/\b([A-Z]{3})\b/);
  if (explicit) return explicit[1];
  const normalized = fold(name).toUpperCase();
  return Object.entries(airportCodes).find(([label]) => normalized.includes(label))?.[1] ?? '';
}

function inferAirlineUrl(flightNumber: string) {
  const normalized = flightNumber.toUpperCase();
  if (normalized.startsWith('VY')) return 'https://www.vueling.com/es/vueling-servicios/prepara-tu-viaje/informacion-de-vuelos/estado-de-vuelos';
  if (normalized.startsWith('U2') || normalized.startsWith('EZY')) return 'https://www.easyjet.com/es/flight-tracker';
  if (normalized.startsWith('IB')) return 'https://www.iberia.com/es/estado-vuelos/';
  if (normalized.startsWith('FR')) return 'https://www.ryanair.com/es/es/lp/travel-updates';
  if (normalized.startsWith('BA')) return 'https://www.britishairways.com/travel/flightstatus/public/es_es';
  return '';
}

function field(section: StructuredSection, key: string) {
  return section.fields[fieldKey(key)] ?? '';
}

function fieldKey(value: string) {
  return fold(value).toUpperCase().trim().replace(/\s+/g, '_');
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function positiveNumber(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function positiveInteger(value: string) {
  return Math.round(positiveNumber(value));
}

function coordinate(value: string, min: number, max: number) {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function safeHttpUrl(value: string) {
  if (!value.trim()) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function reservationStatus(value: string): Activity['reservationStatus'] {
  const normalized = fold(value).toUpperCase();
  if (normalized === 'RECOMENDADA') return 'Recomendada';
  if (normalized === 'NECESARIA') return 'Necesaria';
  if (normalized === 'PENDIENTE') return 'Pendiente';
  if (normalized === 'RESERVADA') return 'Reservada';
  return 'No necesaria';
}

function environment(value: string): Activity['environment'] {
  const normalized = fold(value).toUpperCase();
  if (normalized === 'INTERIOR') return 'Interior';
  if (normalized === 'EXTERIOR') return 'Exterior';
  if (normalized === 'MIXTO') return 'Mixto';
  return 'Sin indicar';
}

function cleanLine(value: string) {
  return value.replace(/[\u00a0\u200b]/g, ' ').replace(/\s+/g, ' ').trim();
}

function fold(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function titleCase(value: string) {
  return value.trim().toLocaleLowerCase('es-ES').replace(/(^|\s)[\p{L}]/gu, (letter) => letter.toLocaleUpperCase('es-ES'));
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIso(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const candidate = key(value);
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });
}
