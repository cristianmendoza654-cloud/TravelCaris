import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pngDimensions = (path: string) => {
  const content = readFileSync(path);
  return {
    width: content.readUInt32BE(16),
    height: content.readUInt32BE(20),
  };
};

describe('PWA and Vercel configuration', () => {
  it('incluye manifest standalone e iconos válidos para iPhone', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
      display: string;
      start_url: string;
      icons: { src: string; sizes: string }[];
    };
    const html = readFileSync('index.html', 'utf8');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512']);
    expect(pngDimensions('public/icons/icon-192.png')).toEqual({ width: 192, height: 192 });
    expect(pngDimensions('public/icons/icon-512.png')).toEqual({ width: 512, height: 512 });
    expect(pngDimensions('public/icons/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
    expect(html).toContain('apple-touch-icon');
    expect(statSync('public/offline.html').size).toBeGreaterThan(100);
  });

  it('registra un service worker con shell offline versionado', () => {
    const worker = readFileSync('public/sw.js', 'utf8');
    const entry = readFileSync('src/main.tsx', 'utf8');
    expect(worker).toContain("CACHE_NAME = 'travelcaris-v11'");
    expect(worker).toContain("'/travel-hero.png'");
    expect(worker).toContain('/offline.html');
    expect(worker).toContain("url.pathname.startsWith('/api/')");
    expect(worker).toContain("addEventListener('notificationclick'");
    expect(entry).toContain(".register('/sw.js', { updateViaCache: 'none' })");
    expect(entry).toContain("addEventListener('controllerchange'");
  });

  it('conserva APIs y archivos antes del fallback SPA de Vercel', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      framework: string;
      outputDirectory: string;
      routes: { handle?: string; dest?: string }[];
    };
    expect(config.framework).toBe('vite');
    expect(config.outputDirectory).toBe('dist');
    expect(config.routes[0].handle).toBe('filesystem');
    expect(config.routes[config.routes.length - 1]?.dest).toBe('/index.html');
  });
});
