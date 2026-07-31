import { describe, expect, it } from 'vitest';
import { buildAiItineraryPrompt, travelCarisAiFormat, type AiItineraryBrief } from './aiItinerary';

const brief: AiItineraryBrief = {
  destination: 'Roma',
  country: 'Italia',
  startDate: '2027-09-03',
  endDate: '2027-09-05',
  travellers: '2 adultos y 1 niño de 8 años',
  budget: '900 EUR sin vuelos',
  pace: 'Equilibrado',
  interests: 'Historia y gastronomía',
  accommodation: 'Centro histórico',
  transport: 'A pie y transporte público',
  accessibility: '',
  food: 'Sin restricciones',
  notes: 'Una tarde tranquila',
};

describe('encargo de itinerario con IA', () => {
  it('incluye la entrevista, los datos del usuario y el formato importable', () => {
    const prompt = buildAiItineraryPrompt(brief);
    expect(prompt).toContain('Destino: Roma');
    expect(prompt).toContain('una sola ronda de preguntas');
    expect(prompt).toContain(travelCarisAiFormat);
    expect(prompt).toContain('[ACTIVIDAD]');
    expect(prompt).toContain('[FIN_TRAVELCARIS]');
  });

  it('prohíbe solicitar o incluir secretos de viaje', () => {
    const prompt = buildAiItineraryPrompt(brief);
    expect(prompt).toMatch(/No solicites pasaportes, localizadores/i);
    expect(prompt).toMatch(/sin localizadores ni billetes/i);
  });
});
