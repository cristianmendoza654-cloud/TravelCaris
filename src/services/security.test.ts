import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('protección de claves', () => {
  it('no incluye nombres de claves privadas ni variables VITE_ en el cliente', () => {
    const clientFiles = [
      'src/services/flightStatus.ts',
      'src/ui/Flights.tsx',
      'public/sw.js',
      'public/manifest.webmanifest',
    ];
    const clientSource = clientFiles.map((file) => readFileSync(resolve(file), 'utf8')).join('\n');
    expect(clientSource).not.toContain('AERODATABOX_API_KEY');
    expect(clientSource).not.toContain('FLIGHTAWARE_API_KEY');
    expect(clientSource).not.toMatch(/VITE_.*API.*KEY/i);
  });
});
