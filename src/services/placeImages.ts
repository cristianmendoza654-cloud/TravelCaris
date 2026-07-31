import type { StoredImage } from '../domain/types';
import { imageFileToStoredImage } from './files';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const REQUEST_TIMEOUT_MS = 9_000;
const searchCache = new Map<string, Promise<PlaceImageResult | null>>();

interface CommonsMetadataValue {
  value?: string;
}

interface CommonsImageInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  mime?: string;
  width?: number;
  height?: number;
  extmetadata?: Record<string, CommonsMetadataValue>;
}

interface CommonsPage {
  index?: number;
  title?: string;
  imageinfo?: CommonsImageInfo[];
}

export interface PlaceImageResult {
  title: string;
  imageUrl: string;
  sourceUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  attribution: string;
}

export async function findPlaceImage(name: string, address = '', refresh = false): Promise<PlaceImageResult | null> {
  const cleanName = compact(name);
  if (cleanName.length < 3 || /^nuevo alojamiento$/i.test(cleanName)) return null;

  const location = compact(address).split(',').slice(-2).join(' ').slice(0, 100);
  const cacheKey = `${cleanName}|${location}`.toLocaleLowerCase('es');
  if (refresh) searchCache.delete(cacheKey);
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const request = searchCommons(cleanName, location).catch(() => null);
  searchCache.set(cacheKey, request);
  return request;
}

export async function placeImageToStoredImage(result: PlaceImageResult): Promise<StoredImage> {
  const metadata = {
    sourceUrl: result.sourceUrl,
    author: result.author,
    license: result.license,
    licenseUrl: result.licenseUrl,
    attribution: result.attribution,
    automatic: true,
  };

  try {
    const response = await fetchWithTimeout(result.imageUrl);
    if (!response.ok) throw new Error('No se pudo descargar la fotografía.');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/') || blob.size > 12 * 1024 * 1024) throw new Error('La fotografía no es válida.');
    const file = new File([blob], fileName(result.title, blob.type), { type: blob.type });
    return { ...(await imageFileToStoredImage(file, 1200)), ...metadata };
  } catch {
    return {
      id: crypto.randomUUID(),
      name: result.title,
      type: 'image/remote',
      dataUrl: result.imageUrl,
      createdAt: new Date().toISOString(),
      ...metadata,
    };
  }
}

export async function findAndStorePlaceImage(name: string, address = '', refresh = false): Promise<StoredImage | null> {
  const result = await findPlaceImage(name, address, refresh);
  return result ? placeImageToStoredImage(result) : null;
}

async function searchCommons(name: string, location: string): Promise<PlaceImageResult | null> {
  const query = `"${name.replace(/["']/g, '')}" ${location} filetype:bitmap`.trim();
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '12',
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: '1200',
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  const response = await fetchWithTimeout(`${COMMONS_API}?${params}`);
  if (!response.ok) return null;
  const payload = await response.json() as { query?: { pages?: CommonsPage[] } };
  const pages = [...(payload.query?.pages ?? [])].sort((left, right) => (left.index ?? 99) - (right.index ?? 99));

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const imageUrl = info?.thumburl ?? info?.url ?? '';
    if (!info || !isUsableImage(page.title ?? '', info, imageUrl)) continue;
    const metadata = info.extmetadata ?? {};
    const author = plainText(metadata.Artist?.value) || plainText(metadata.Credit?.value) || 'Colaborador de Wikimedia Commons';
    const license = plainText(metadata.LicenseShortName?.value) || 'Licencia indicada en Wikimedia Commons';
    const sourceUrl = safeHttpsUrl(info.descriptionurl, 'commons.wikimedia.org');
    if (!sourceUrl) continue;
    return {
      title: (page.title ?? 'Fotografía de Wikimedia Commons').replace(/^File:/i, ''),
      imageUrl,
      sourceUrl,
      author,
      license,
      licenseUrl: safeHttpsUrl(metadata.LicenseUrl?.value),
      attribution: `${author} · ${license}`,
    };
  }
  return null;
}

function isUsableImage(title: string, info: CommonsImageInfo, imageUrl: string) {
  const unwanted = /\b(logo|map|plan|diagram|icon|flag|coat of arms|escudo|floor plan|poster|ticket|menu)\b/i;
  return (
    /^image\/(jpeg|png|webp)$/i.test(info.mime ?? '') &&
    !unwanted.test(title) &&
    (info.width ?? 0) >= 500 &&
    (info.height ?? 0) >= 350 &&
    Boolean(safeHttpsUrl(imageUrl, 'upload.wikimedia.org'))
  );
}

function plainText(value = '') {
  if (!value) return '';
  const document = new DOMParser().parseFromString(`<body>${value}</body>`, 'text/html');
  return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function safeHttpsUrl(value?: string, requiredHost?: string) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (!requiredHost || url.hostname === requiredHost) ? url.toString() : '';
  } catch {
    return '';
  }
}

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function fileName(title: string, type: string) {
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  return `${title.replace(/^File:/i, '').replace(/[^a-z0-9áéíóúüñ ._-]/gi, '').slice(0, 80) || 'lugar'}.${extension}`;
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, referrerPolicy: 'no-referrer' });
  } finally {
    window.clearTimeout(timeout);
  }
}
