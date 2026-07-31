import { describe, expect, it } from 'vitest';
import {
  createActivity,
  deleteActivity,
  exportBackup,
  getSnapshot,
  importBackup,
  moveActivity,
  putDocument,
  putExpense,
  putPackingItem,
  recordSearch,
  reorderActivities,
  restoreInitialData,
  savePlace,
  saveSearchProvider,
  saveActivity,
} from './storage';

describe('storage repository', () => {
  it('carga el itinerario inicial', async () => {
    const snapshot = await getSnapshot();
    expect(snapshot.activities.length).toBeGreaterThan(25);
    expect(snapshot.activities.some((activity) => activity.title.includes('British Museum'))).toBe(true);
  });

  it('crea, edita y elimina una actividad', async () => {
    const created = await createActivity({ title: 'Café familiar', day: '2026-08-02', category: 'Cafetería' });
    await saveActivity({ ...created, title: 'Café familiar editado' });
    let snapshot = await getSnapshot();
    expect(snapshot.activities.find((activity) => activity.id === created.id)?.title).toBe('Café familiar editado');
    await deleteActivity(created.id);
    snapshot = await getSnapshot();
    expect(snapshot.activities.find((activity) => activity.id === created.id)).toBeUndefined();
  });

  it('reordena y cambia de día una actividad', async () => {
    await restoreInitialData();
    const snapshot = await getSnapshot();
    const day = snapshot.activities.filter((activity) => activity.day === '2026-08-01');
    const reordered = [...day].reverse().map((activity) => activity.id);
    await reorderActivities('2026-08-01', reordered);
    let next = await getSnapshot();
    expect(next.activities.filter((activity) => activity.day === '2026-08-01')[0].id).toBe(reordered[0]);
    await moveActivity(reordered[0], '2026-08-03');
    next = await getSnapshot();
    expect(next.activities.find((activity) => activity.id === reordered[0])?.day).toBe('2026-08-03');
  });

  it('exporta e importa una copia JSON', async () => {
    await createActivity({ title: 'Lugar para exportar', day: '2026-08-04' });
    const backup = await exportBackup();
    expect(backup.activities.some((activity) => activity.title === 'Lugar para exportar')).toBe(true);
    await restoreInitialData();
    await importBackup(backup, 'replace');
    const snapshot = await getSnapshot();
    expect(snapshot.activities.some((activity) => activity.title === 'Lugar para exportar')).toBe(true);
    expect(backup.searchProviders.length).toBeGreaterThan(5);
  });

  it('persiste proveedores, historial y lugares guardados por viaje', async () => {
    await restoreInitialData();
    let snapshot = await getSnapshot();
    const provider = snapshot.searchProviders[0];
    await saveSearchProvider({ ...provider, enabled: false });
    await recordSearch({
      query: 'free tours con niños',
      context: { kind: 'Zona de Londres', label: 'Westminster', query: 'Westminster, London' },
      providerId: provider.id,
    });
    await savePlace({
      name: 'Lugar de prueba',
      address: 'Westminster, London',
      category: 'Tour',
      sourceLink: 'https://example.com',
      notes: '',
      favorite: true,
    });
    snapshot = await getSnapshot();
    expect(snapshot.searchProviders.find((item) => item.id === provider.id)?.enabled).toBe(false);
    expect(snapshot.searchHistory[0].query).toBe('free tours con niños');
    expect(snapshot.savedPlaces[0].name).toBe('Lugar de prueba');
  });

  it('persiste imágenes, documentos, gastos y equipaje dentro de la copia', async () => {
    await restoreInitialData();
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    await createActivity({
      title: 'Actividad con imagen',
      day: '2026-08-02',
      mainImage: dataUrl,
    });
    await putDocument({
      id: 'document-test',
      tripId: '',
      title: 'Documento local',
      type: 'Confirmación',
      date: '2026-08-02',
      notes: '',
      important: true,
      fileName: 'confirmacion.txt',
      fileType: 'text/plain',
      dataUrl: 'data:text/plain;base64,b2s=',
      createdAt: '2026-07-31T00:00:00.000Z',
    });
    await putExpense({
      id: 'expense-test',
      tripId: '',
      concept: 'Comida familiar',
      category: 'Comida',
      date: '2026-08-02',
      amount: 25,
      currency: 'GBP',
      paidBy: 'Familia',
      paymentMethod: 'Tarjeta',
      notes: '',
    });
    await putPackingItem({
      id: 'packing-test',
      tripId: '',
      list: 'Equipaje',
      title: 'Paraguas',
      done: false,
      person: '',
      quantity: 1,
      notes: '',
      order: 99,
    });
    const backup = await exportBackup();
    expect(backup.activities.find((item) => item.title === 'Actividad con imagen')?.mainImage).toBe(dataUrl);
    expect(backup.documents.find((item) => item.id === 'document-test')?.dataUrl).toContain('data:text/plain');
    expect(backup.expenses.find((item) => item.id === 'expense-test')?.amount).toBe(25);
    expect(backup.packingItems.find((item) => item.id === 'packing-test')?.title).toBe('Paraguas');
  });
});
