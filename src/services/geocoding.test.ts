import { describe, expect, it, vi } from 'vitest';
import type { PdfImportDraft } from './pdfImport';
import { geocodePdfDraft } from './geocoding';

const draft = {
  trip: { destination: 'Roma', country: 'Italia' },
  activities: [{ title: 'Coliseo', day: '2027-09-03', address: 'Piazza del Colosseo' }],
  accommodations: [{ name: 'Hotel Centro', address: 'Via Roma 1' }],
} as PdfImportDraft;

describe('ubicación automática de una importación', () => {
  it('añade coordenadas sin modificar el borrador original', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ lat: '41.9000', lon: '12.5000' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ lat: '41.8902', lon: '12.4922' }]), { status: 200 }));

    const result = await geocodePdfDraft(draft, { fetcher, delayMs: 0 });

    expect(result.located).toBe(2);
    expect(result.unresolved).toBe(0);
    expect(result.draft.activities[0]).toMatchObject({ lat: 41.8902, lng: 12.4922 });
    expect(result.draft.accommodations[0]).toMatchObject({ lat: 41.9, lng: 12.5 });
    expect(draft.activities[0].lat).toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('Piazza+del+Colosseo%2C+Roma%2C+Italia'), expect.any(Object));
  });

  it('conserva las coordenadas existentes y tolera resultados vacíos', async () => {
    const source = {
      ...draft,
      activities: [{ ...draft.activities[0], lat: 41.89, lng: 12.49 }],
    };
    const fetcher = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));

    const result = await geocodePdfDraft(source, { fetcher, delayMs: 0 });

    expect(result.draft.activities[0]).toMatchObject({ lat: 41.89, lng: 12.49 });
    expect(result.unresolved).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('prioriza alojamientos y omite tareas de transporte', async () => {
    const source = {
      ...draft,
      activities: [
        ...draft.activities,
        { title: 'Traslado al aeropuerto', day: '2027-09-03', address: 'Aeropuerto', category: 'Transporte' },
      ],
    } as PdfImportDraft;
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ lat: '41.9', lon: '12.5' }]), { status: 200 }));

    await geocodePdfDraft(source, { fetcher, delayMs: 0, maxRequests: 1 });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('Via+Roma+1'), expect.any(Object));
  });

  it('puede ubicar un punto de interés por nombre aunque no tenga dirección', async () => {
    const source = {
      ...draft,
      activities: [{ title: 'Galería Borghese', day: '2027-09-03', address: '', category: 'Museo' }],
      accommodations: [],
    } as PdfImportDraft;
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ lat: '41.9142', lon: '12.4922' }]), { status: 200 }));

    const result = await geocodePdfDraft(source, { fetcher, delayMs: 0 });

    expect(result.draft.activities[0]).toMatchObject({ lat: 41.9142, lng: 12.4922 });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('Galer%C3%ADa+Borghese%2C+Roma%2C+Italia'), expect.any(Object));
  });
});
