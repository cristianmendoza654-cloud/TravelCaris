import type { StoredImage } from '../domain/types';

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

export async function imageFileToStoredImage(file: File, maxSize = 1280): Promise<StoredImage> {
  if (!file.type.startsWith('image/')) throw new Error('Selecciona una imagen válida.');
  if (file.size > 12 * 1024 * 1024) throw new Error('La imagen supera el tamaño máximo de 12 MB.');

  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar la imagen.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: 'image/jpeg',
    dataUrl: canvas.toDataURL('image/jpeg', 0.78),
    createdAt: new Date().toISOString(),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
    image.src = src;
  });
}
