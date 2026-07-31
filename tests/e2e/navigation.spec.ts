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
  const stacking = await page.evaluate(() => ({
    isolation: getComputedStyle(document.querySelector('.map-wrap')!).isolation,
    mapZIndex: getComputedStyle(document.querySelector('.map-wrap')!).zIndex,
    navigationZIndex: getComputedStyle(document.querySelector('.bottom-nav')!).zIndex,
  }));
  expect(stacking).toEqual({ isolation: 'isolate', mapZIndex: '0', navigationZIndex: '30' });
});

test('convierte gastos entre la moneda del destino y la del viajero', async ({ page }) => {
  let rateRequests = 0;
  await page.route('**/v2/rate/GBP/EUR', (route) => {
    rateRequests += 1;
    return route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ date: '2026-07-31', base: 'GBP', quote: 'EUR', rate: 1.18 }),
    });
  });
  await page.goto('/mas');
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByLabel('Moneda del destino').selectOption('GBP');
  await expect.poll(() => rateRequests).toBeGreaterThan(0);
  await expect(page.getByText('1 GBP = 1.1800 EUR')).toBeVisible();

  await page.getByRole('button', { name: 'Gastos', exact: true }).click();
  await page.getByLabel('Concepto').fill('Metro');
  await page.getByLabel('Importe').fill('10');
  await page.getByRole('button', { name: 'Añadir gasto' }).click();
  await expect(page.locator('.activity-card').filter({ hasText: 'Metro' })).toContainText('11,80');
});

test('programa, edita y exporta un recordatorio fechado', async ({ page }) => {
  await page.goto('/mas');
  await page.getByRole('button', { name: 'Recordatorios', exact: true }).click();
  await page.getByLabel('Recordatorio').fill('Reservar entradas');
  await page.getByLabel('Fecha', { exact: true }).fill('2027-09-02');
  await page.getByLabel('Hora', { exact: true }).fill('18:45');
  await page.getByLabel('Notas', { exact: true }).fill('Revisar la web oficial');
  await page.getByRole('button', { name: 'Programar recordatorio' }).click();
  await expect(page.getByText('Reservar entradas', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar recordatorio Reservar entradas' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Añadir Reservar entradas al calendario' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('recordatorio-reservar-entradas.ics');
});

test('personaliza el viaje y prepara equipaje por persona sin desbordar el móvil', async ({ page }) => {
  await page.goto('/mas');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const profile = page.locator('.trip-profile-editor');
  await profile.getByLabel('Destino', { exact: true }).fill('Roma');
  await profile.getByLabel('País').fill('Italia');
  await profile.getByLabel('Viajeros').fill('2 adultos; Leo');
  await profile.getByLabel('Presupuesto (EUR)').fill('900');
  await profile.getByRole('button', { name: 'Guardar perfil' }).click();

  await page.getByRole('button', { name: 'Equipaje', exact: true }).click();
  await page.getByLabel('Nuevo elemento').fill('Cargador portátil');
  await page.getByLabel('Lista').selectOption('Tecnología');
  await page.getByLabel('Persona').fill('Leo');
  await page.getByLabel('Cantidad').fill('2');
  await page.getByRole('button', { name: 'Añadir a la lista' }).click();
  await expect(page.getByText('2 × Cargador portátil')).toBeVisible();
  await expect(page.getByText(/Tecnología · Leo/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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

test('importa en WebKit móvil sin depender de APIs de archivo modernas ni del MIME', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Blob.prototype, 'arrayBuffer', { value: undefined, configurable: true });
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

test('importa un PDF real en WebKit móvil cuando se proporciona localmente', async ({ page }) => {
  const pdfPath = process.env.TRAVELCARIS_TEST_PDF;
  test.skip(!pdfPath, 'No se proporcionó un PDF privado para esta comprobación local.');
  await page.goto('/mas');
  await page.getByRole('button', { name: 'Importar PDF' }).click();
  await page.locator('input[type="file"][accept*="pdf"]').setInputFiles(pdfPath!);
  await expect(page.getByLabel('Resumen detectado')).toBeVisible({ timeout: 30_000 });
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
  await page.getByLabel('Destino', { exact: true }).fill('Roma');
  await page.getByLabel('Qué quieres hacer en este viaje').fill('Historia, parques y comida local con un ritmo tranquilo.');
  await page.getByRole('button', { name: /Preparar instrucciones/i }).click();

  await expect(page.getByLabel('Encargo preparado')).toContainText('TRAVELCARIS-AI-PDF-V2');
  await expect(page.getByRole('link', { name: 'Abrir ChatGPT' })).toHaveAttribute('href', 'https://chatgpt.com/');
  await page.getByRole('button', { name: 'Ya tengo el PDF' }).click();
  await expect(page.getByRole('heading', { name: 'Rellenar desde un PDF' })).toBeVisible();
});

test('elimina alojamientos y permite restablecer la aplicación', async ({ page }) => {
  await page.goto('/mas');
  await page.getByRole('button', { name: 'Alojamientos', exact: true }).click();
  await page.getByRole('button', { name: 'Añadir alojamiento' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo alojamiento' })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page.getByText('Todavía no hay alojamientos en este viaje.')).toBeVisible();

  await page.getByRole('button', { name: 'Añadir alojamiento' }).click();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Restablecer aplicación' }).click();
  await expect(page.getByText('TravelCaris 3.6.0')).toBeVisible();
  await page.getByRole('button', { name: 'Alojamientos', exact: true }).click();
  await expect(page.getByText('Todavía no hay alojamientos en este viaje.')).toBeVisible();
});

test('crea y elimina un viaje completo desde Mis viajes', async ({ page }) => {
  await page.goto('/mas');
  await page.getByRole('button', { name: 'Nuevo', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Viaje que se puede eliminar');
  await page.getByLabel('Destino', { exact: true }).fill('Roma');
  await page.getByLabel('País', { exact: true }).fill('Italia');
  await page.getByRole('button', { name: 'Crear y abrir' }).click();

  const trip = page.locator('.trip-card').filter({ hasText: 'Viaje que se puede eliminar' });
  await expect(trip).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await trip.getByRole('button', { name: 'Eliminar viaje' }).click();
  await expect(trip).toHaveCount(0);
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
