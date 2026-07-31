import { describe, expect, it } from 'vitest';
import { mapMarkerLegend, mapMarkerStyle } from './map';

describe('map marker styles', () => {
  it('groups places into recognisable map categories', () => {
    expect(mapMarkerStyle('Alojamiento').kind).toBe('accommodation');
    expect(mapMarkerStyle('Restaurante').kind).toBe('food');
    expect(mapMarkerStyle('Museo').kind).toBe('culture');
    expect(mapMarkerStyle('Espectáculo').kind).toBe('leisure');
    expect(mapMarkerStyle('Parque').kind).toBe('nature');
    expect(mapMarkerStyle('Aeropuerto').kind).toBe('transport');
  });

  it('keeps a fallback style and exposes a complete legend', () => {
    expect(mapMarkerStyle('Otros').kind).toBe('other');
    expect(new Set(mapMarkerLegend.map((item) => item.kind)).size).toBe(9);
  });
});
