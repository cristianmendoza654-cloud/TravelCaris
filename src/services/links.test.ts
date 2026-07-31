import { describe, expect, it } from 'vitest';
import type { ExploreContext, SearchProvider } from '../domain/types';
import { appleMapsSearch, buildProviderSearch, composeExploreQuery, googleMapsSearch, googleSearch, tripadvisorSearch } from './links';

describe('external links', () => {
  it('crea enlaces codificados para mapas y buscadores', () => {
    expect(googleMapsSearch('Museo central Roma')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Museo%20central%20Roma',
    );
    expect(appleMapsSearch('Centro Roma')).toBe('https://maps.apple.com/?q=Centro%20Roma');
    expect(googleSearch('farmacias cercanas')).toContain('farmacias%20cercanas');
    expect(tripadvisorSearch('pizza familiar Roma')).toContain('pizza%20familiar%20Roma');
  });

  it('combina la consulta con el contexto sin duplicar la ciudad', () => {
    const context: ExploreContext = { kind: 'Zona del destino', label: 'Centro', query: 'Centro, Roma' };
    expect(composeExploreQuery('free tour español', context, 'Roma')).toBe('free tour español Centro, Roma Roma');
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
