import { describe, expect, it } from 'vitest';
import { fileToDataUrl, imageFileToStoredImage } from './files';

describe('local files', () => {
  it('convierte un archivo local a data URL sin enviarlo a ningún servidor', async () => {
    const result = await fileToDataUrl(new File(['TravelCaris'], 'nota.txt', { type: 'text/plain' }));
    expect(result).toMatch(/^data:text\/plain;base64,/);
  });

  it('rechaza archivos que no sean imágenes antes de procesarlos', async () => {
    await expect(imageFileToStoredImage(new File(['x'], 'archivo.txt', { type: 'text/plain' }))).rejects.toThrow(
      'imagen',
    );
  });
});
