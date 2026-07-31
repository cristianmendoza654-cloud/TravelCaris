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
