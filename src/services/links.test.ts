import { describe, expect, it } from 'vitest';
import type { ExploreContext, SearchProvider } from '../domain/types';
import { appleMapsSearch, buildProviderSearch, composeExploreQuery, googleMapsSearch, googleSearch, tripadvisorSearch } from './links';

describe('external links', () => {
  it('crea enlaces codificados para mapas y buscadores', () => {
    expect(googleMapsSearch('British Museum Londres')).toBe(
      'https://www.google.com/maps/search/?api=1&query=British%20Museum%20Londres',
    );
    expect(appleMapsSearch('Victoria London')).toBe('https://maps.apple.com/?q=Victoria%20London');
    expect(googleSearch('farmacias cercanas')).toContain('farmacias%20cercanas');
    expect(tripadvisorSearch('pizza familiar')).toContain('pizza%20familiar%20Londres');
  });

  it('combina la consulta con el contexto sin duplicar la ciudad', () => {
    const context: ExploreContext = { kind: 'Zona de Londres', label: 'Westminster', query: 'Westminster, London' };
    expect(composeExploreQuery('free tour español', context, 'Londres')).toBe('free tour español Westminster, London Londres');
  });

  it('indica cuándo debe copiarse la consulta para un proveedor sin URL estable', () => {
    const provider: SearchProvider = {
      id: 'custom',
      name: 'Proveedor',
      kind: 'custom',
      urlTemplate: 'https://example.com/',
      enabled: true,
      supportsStableSearchUrl: false,
      order: 1,
      createdAt: '',
      updatedAt: '',
    };
    expect(buildProviderSearch(provider, 'tour familiar').copyQuery).toBe(true);
    expect(buildProviderSearch({ ...provider, urlTemplate: 'https://example.com/?q={query}', supportsStableSearchUrl: true }, 'niños & ocio').url).toContain('ni%C3%B1os%20%26%20ocio');
  });
});
