import { describe, expect, it } from 'vitest';
import { buildAiItineraryPrompt, buildAiPdfRegenerationPrompt, travelCarisAiFormat, type AiItineraryBrief } from './aiItinerary';

const brief: AiItineraryBrief = {
  destination: 'Roma',
  country: 'Italia',
  startDate: '2027-09-03',
  endDate: '2027-09-05',
  travellers: '2 adultos y 1 niño de 8 años',
  budget: '900 EUR sin vuelos',
  destinationCurrency: 'EUR',
  travellerCurrency: 'EUR',
  pace: 'Equilibrado',
  interests: 'Historia y gastronomía',
  accommodation: 'Centro histórico',
  transport: 'A pie y transporte público',
  accessibility: '',
  food: 'Sin restricciones',
  completedPreparations: 'Hotel reservado',
  preparations: 'Reservar el Coliseo un mes antes',
  packing: 'Medicamentos y cargadores',
  notes: 'Una tarde tranquila',
};

describe('encargo de itinerario con IA', () => {
  it('incluye la entrevista, los datos del usuario y el formato importable', () => {
    const prompt = buildAiItineraryPrompt(brief);
    expect(prompt).toContain('Destino: Roma');
    expect(prompt).toContain('una sola ronda de preguntas');
    expect(prompt).toContain(travelCarisAiFormat);
    expect(prompt).toContain('[ACTIVIDAD]');
    expect(prompt).toContain('[RECORDATORIO]');
    expect(prompt).toContain('[EQUIPAJE]');
    expect(prompt).toContain('[FIN_TRAVELCARIS]');
    expect(prompt).toContain('TRAVELCARIS-AI-PDF-V4');
    expect(prompt).toContain('FECHA_VERIFICACION');
    expect(prompt).toContain('HORARIO_APERTURA');
    expect(prompt).toContain('PRECIO_ADULTO');
    expect(prompt).toContain('PUNTO_ENCUENTRO');
    expect(prompt).toContain('TERMINAL_SALIDA');
    expect(prompt).toContain('migra el contenido completo al formato V4');
    expect(prompt).toContain('Hotel reservado');
    expect(prompt).toContain('ANEXO OBLIGATORIO PARA LA IMPORTACIÓN');
    expect(prompt).toContain('Una portada, una tabla, tarjetas visuales');
    expect(prompt).toContain('COMPROBACIÓN FINAL OBLIGATORIA');
  });

  it('prohíbe solicitar o incluir secretos de viaje', () => {
    const prompt = buildAiItineraryPrompt(brief);
    expect(prompt).toMatch(/No solicites pasaportes, localizadores/i);
    expect(prompt).toMatch(/sin localizadores ni billetes/i);
  });

  it('prepara la regeneración de un PDF anterior sin perder sus datos', () => {
    const prompt = buildAiPdfRegenerationPrompt(brief);
    expect(prompt).toContain('Te adjunto mi PDF actual del viaje');
    expect(prompt).toContain('sin perder información útil');
    expect(prompt).toContain('TRAVELCARIS-AI-PDF-V4');
    expect(prompt).toMatch(/No incluyas localizadores, billetes, pasaportes/i);
  });
});
