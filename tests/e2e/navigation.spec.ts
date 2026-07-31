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
