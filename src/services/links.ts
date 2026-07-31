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
  return `https://www.tripadvisor.es/Search?q=${encode(`${query} Londres`)}`;
}

export function shareText(title: string, lines: string[]) {
  return `${title}\n${lines.filter(Boolean).join('\n')}`;
}
