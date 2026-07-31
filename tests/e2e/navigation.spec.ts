import { expect, test } from '@playwright/test';

test('navegación móvil básica', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('TravelCaris')).toBeVisible();
  const navigation = page.getByRole('navigation', { name: /principal/i });
  await navigation.getByRole('link', { name: /Itinerario/i }).click();
  await expect(page.getByRole('heading', { name: 'Itinerario' })).toBeVisible();
  await navigation.getByRole('link', { name: /Vuelos/i }).click();
  await expect(page.getByRole('heading', { name: 'Vuelos' })).toBeVisible();
  await navigation.getByRole('link', { name: /Mapa/i }).click();
  await expect(page.getByTestId('trip-map')).toBeVisible();
});

test('abre la importación privada de PDF', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: /principal/i });
  await navigation.getByRole('link', { name: /Más/i }).click();
  await page.getByRole('button', { name: 'Importar PDF' }).click();
  await expect(page.getByRole('heading', { name: 'Rellenar desde un PDF' })).toBeVisible();
  await expect(page.getByText(/no se sube a Vercel/i)).toBeVisible();
  await expect(page.locator('input[type="file"][accept*="pdf"]')).toHaveCount(1);
});

test('importa en WebKit móvil sin depender de APIs modernas ni del MIME', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Blob.prototype, 'arrayBuffer', { value: undefined, configurable: true });
    Object.defineProperty(globalThis, 'Worker', { value: undefined, configurable: true });
  });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: /principal/i });
  await navigation.getByRole('link', { name: /Más/i }).click();
  await page.getByRole('button', { name: 'Importar PDF' }).click();
  await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({
    name: 'itinerario-movil.pdf',
    mimeType: 'application/octet-stream',
    buffer: travelCarisPdfFixture(),
  });

  await expect(page.getByLabel('Resumen detectado')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Formato TravelCaris IA detectado/i)).toBeVisible();
});

test('muestra la ubicación actual solo después de conceder permiso', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 40.4168, longitude: -3.7038, accuracy: 12 });
  await page.goto('/mapa');

  await expect(page.getByTestId('current-location-marker')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mostrar mi ubicación' }).click();

  await expect(page.getByTestId('current-location-marker')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Detener seguimiento' })).toBeVisible();
});

test('prepara con IA un encargo compatible con la importación PDF', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: /principal/i });
  await navigation.getByRole('link', { name: /Más/i }).click();
  await page.getByRole('button', { name: 'Crear con IA' }).click();

  await expect(page.getByRole('heading', { name: /Crear itinerario con IA/i })).toBeVisible();
  await page.getByLabel('Destino').fill('Roma');
  await page.getByLabel('Qué quieres hacer en este viaje').fill('Historia, parques y comida local con un ritmo tranquilo.');
  await page.getByRole('button', { name: /Preparar instrucciones/i }).click();

  await expect(page.getByLabel('Encargo preparado')).toContainText('TRAVELCARIS-AI-PDF-V1');
  await expect(page.getByRole('link', { name: 'Abrir ChatGPT' })).toHaveAttribute('href', 'https://chatgpt.com/');
  await page.getByRole('button', { name: 'Ya tengo el PDF' }).click();
  await expect(page.getByRole('heading', { name: 'Rellenar desde un PDF' })).toBeVisible();
});

function travelCarisPdfFixture() {
  const lines = [
    'TRAVELCARIS-AI-PDF-V1',
    '[VIAJE]',
    'NOMBRE: Viaje movil',
    'DESTINO: Roma',
    'PAIS: Italia',
    'INICIO: 2027-09-03',
    'FIN: 2027-09-05',
    '[ACTIVIDAD]',
    'FECHA: 2027-09-03',
    'INICIO: 11:30',
    'TITULO: Coliseo',
    'CATEGORIA: Monumento',
    'DIRECCION: Piazza del Colosseo',
    '[FIN_ACTIVIDAD]',
    '[FIN_TRAVELCARIS]',
  ];
  const content = `BT\n/F1 10 Tf\n72 760 Td\n${lines.map((line, index) => `${index ? '0 -14 Td\n' : ''}(${line}) Tj`).join('\n')}\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}
