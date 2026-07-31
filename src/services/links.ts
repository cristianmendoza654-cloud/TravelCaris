import type { ExploreContext, SearchProvider } from '../domain/types';

export const encode = (value: string) => encodeURIComponent(value.trim());

export function googleMapsSearch(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encode(query)}`;
}

export function appleMapsSearch(query: string) {
  return `https://maps.apple.com/?q=${encode(query)}`;
}

export function googleSearch(query: string) {
  return `https://www.google.com/search?q=${encode(query)}`;
}

export function tripadvisorSearch(query: string) {
  return `https://www.tripadvisor.es/Search?q=${encode(query)}`;
}

export function shareText(title: string, lines: string[]) {
  return `${title}\n${lines.filter(Boolean).join('\n')}`;
}

export function composeExploreQuery(query: string, context: ExploreContext, destination: string) {
  const place = context.query || context.label || destination;
  return [query.trim(), place.trim(), destination.trim()]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(' ');
}

export function buildProviderSearch(provider: SearchProvider, query: string) {
  const encoded = encode(query);
  return {
    url: provider.urlTemplate.includes('{query}')
      ? provider.urlTemplate.split('{query}').join(encoded)
      : provider.urlTemplate,
    copyQuery: !provider.supportsStableSearchUrl,
  };
}
