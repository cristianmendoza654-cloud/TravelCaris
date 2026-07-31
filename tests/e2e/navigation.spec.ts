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
