import { describe, expect, it } from 'vitest';
import {
  createActivity,
  deleteActivity,
  exportBackup,
  getSnapshot,
  importBackup,
  moveActivity,
  reorderActivities,
  restoreInitialData,
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
  });
});
