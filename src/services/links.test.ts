import { describe, expect, it } from 'vitest';
import { appleMapsSearch, googleMapsSearch, googleSearch, tripadvisorSearch } from './links';

describe('external links', () => {
  it('crea enlaces codificados para mapas y buscadores', () => {
    expect(googleMapsSearch('British Museum Londres')).toBe(
      'https://www.google.com/maps/search/?api=1&query=British%20Museum%20Londres',
    );
    expect(appleMapsSearch('100 Warwick Way')).toBe('https://maps.apple.com/?q=100%20Warwick%20Way');
    expect(googleSearch('farmacias cercanas')).toContain('farmacias%20cercanas');
    expect(tripadvisorSearch('pizza familiar')).toContain('pizza%20familiar%20Londres');
  });
});
