import { afterEach, describe, expect, it, vi } from 'vitest';
import { findPlaceImage, placeImageToStoredImage } from './placeImages';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('automatic place images', () => {
  it('selects a sufficiently large Commons photograph and preserves its attribution', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: {
          pages: [
            {
              index: 1,
              title: 'File:Example place.jpg',
              imageinfo: [{
                mime: 'image/jpeg',
                width: 1600,
                height: 1000,
                thumburl: 'https://upload.wikimedia.org/example-place.jpg',
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:Example_place.jpg',
                extmetadata: {
                  Artist: { value: '<a href="/wiki/User:Ana">Ana Example</a>' },
                  LicenseShortName: { value: 'CC BY-SA 4.0' },
                  LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
                },
              }],
            },
          ],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await findPlaceImage('Museo de ejemplo único', 'Madrid, España');

    expect(result).toMatchObject({
      imageUrl: 'https://upload.wikimedia.org/example-place.jpg',
      author: 'Ana Example',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example_place.jpg',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('origin=*');
  });

  it('keeps the remote photo as a fallback when local compression is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const stored = await placeImageToStoredImage({
      title: 'Lugar.jpg',
      imageUrl: 'https://upload.wikimedia.org/lugar.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lugar.jpg',
      author: 'Autora',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Autora · CC BY 4.0',
    });

    expect(stored.dataUrl).toBe('https://upload.wikimedia.org/lugar.jpg');
    expect(stored).toMatchObject({ automatic: true, author: 'Autora', license: 'CC BY 4.0' });
  });
});
