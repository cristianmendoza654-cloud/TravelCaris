import { describe, expect, it } from 'vitest';
import {
  applyPdfImport,
  createFlight,
  createTrip,
  createActivity,
  deleteAccommodation,
  deleteActivity,
  deleteDocument,
  deleteExpense,
  deleteFlight,
  deletePackingItem,
  deleteReminder,
  deleteTrip,
  exportBackup,
  getSnapshot,
  importBackup,
  moveActivity,
  putAccommodation,
  putDocument,
  putExpense,
  putPackingItem,
  putReminder,
  recordSearch,
  reorderActivities,
  restoreInitialData,
  savePlace,
  saveSearchProvider,
  saveActivity,
  selectTrip,
  validateBackup,
} from './storage';
import { parseTravelDocumentText } from './pdfImport';

describe('storage repository', () => {
  it('comienza sin itinerario, alojamientos ni vuelos publicados', async () => {
    await restoreInitialData();
    const snapshot = await getSnapshot();
    expect(snapshot.activities).toEqual([]);
    expect(snapshot.accommodations).toEqual([]);
    expect(snapshot.flights).toEqual([]);
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

  it('elimina elementos individuales y borra un viaje completo en cascada', async () => {
    await restoreInitialData();
    const trip = await createTrip({ name: 'Viaje temporal', destination: 'Roma', country: 'Italia', startDate: '2027-09-01', endDate: '2027-09-03' });
    await selectTrip(trip.id);
    const now = new Date().toISOString();
    await putAccommodation({ id: 'accommodation-delete', tripId: trip.id, name: 'Hotel temporal', address: '', phone: '', checkIn: '', checkOut: '', startDate: trip.startDate, endDate: trip.endDate, entryInstructions: '', luggageNotes: '', notes: '', images: [], active: true, createdAt: now, updatedAt: now });
    await putDocument({ id: 'document-delete', tripId: trip.id, title: 'Documento temporal', type: 'Otro', date: trip.startDate, notes: '', important: false, fileName: 'temporal.pdf', fileType: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERi0=', createdAt: now });
    await putExpense({ id: 'expense-delete', tripId: trip.id, concept: 'Gasto temporal', category: 'Otros', date: trip.startDate, amount: 10, currency: 'EUR', paidBy: '', paymentMethod: '', notes: '' });
    await putPackingItem({ id: 'packing-delete', tripId: trip.id, list: 'Equipaje', title: 'Elemento temporal', done: false, person: '', quantity: 1, notes: '', order: 1 });
    await putReminder({ id: 'reminder-delete', tripId: trip.id, title: 'Recordatorio temporal', date: trip.startDate, time: '09:00', notes: '', done: false });
    const flight = await createFlight({ tripId: trip.id, flightNumber: 'IB1234', scheduledDate: trip.startDate, departureIata: 'MAD', arrivalIata: 'FCO' });

    await deleteAccommodation('accommodation-delete');
    await deleteDocument('document-delete');
    await deleteExpense('expense-delete');
    await deletePackingItem('packing-delete');
    await deleteReminder('reminder-delete');
    await deleteFlight(flight.id);
    let snapshot = await getSnapshot();
    expect([snapshot.accommodations, snapshot.documents, snapshot.expenses, snapshot.packingItems, snapshot.reminders, snapshot.flights].every((items) => items.length === 0)).toBe(true);

    await createActivity({ tripId: trip.id, title: 'Actividad que debe desaparecer', day: trip.startDate });
    await putDocument({ id: 'document-cascade', tripId: trip.id, title: 'Documento en cascada', type: 'Otro', date: trip.startDate, notes: '', important: false, fileName: 'cascada.pdf', fileType: 'application/pdf', dataUrl: '', createdAt: now });
    await deleteTrip(trip.id);
    snapshot = await getSnapshot();
    const backup = await exportBackup();
    expect(snapshot.trips.some((item) => item.id === trip.id)).toBe(false);
    expect(backup.activities.some((item) => item.tripId === trip.id)).toBe(false);
    expect(backup.documents.some((item) => item.tripId === trip.id)).toBe(false);
  });

  it('reordena y cambia de día una actividad', async () => {
    await restoreInitialData();
    await createActivity({ title: 'Primera', day: '2027-09-01', startTime: '09:00' });
    await createActivity({ title: 'Segunda', day: '2027-09-01', startTime: '11:00' });
    const snapshot = await getSnapshot();
    const day = snapshot.activities.filter((activity) => activity.day === '2027-09-01');
    const reordered = [...day].reverse().map((activity) => activity.id);
    await reorderActivities('2027-09-01', reordered);
    let next = await getSnapshot();
    expect(next.activities.filter((activity) => activity.day === '2027-09-01')[0].id).toBe(reordered[0]);
    await moveActivity(reordered[0], '2027-09-03');
    next = await getSnapshot();
    expect(next.activities.find((activity) => activity.id === reordered[0])?.day).toBe('2027-09-03');
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

  it('rechaza copias incompletas o con enlaces peligrosos antes de escribir en IndexedDB', async () => {
    expect(validateBackup({ trips: [], activities: [], flights: [], flightAlerts: [], settings: {} })).toBe(false);
    expect(validateBackup({})).toBe(false);
    const backup = await exportBackup();
    backup.searchProviders[0].urlTemplate = 'javascript:alert(1)';
    expect(validateBackup(backup)).toBe(false);
  });

  it('persiste proveedores, historial y lugares guardados por viaje', async () => {
    await restoreInitialData();
    let snapshot = await getSnapshot();
    const provider = snapshot.searchProviders[0];
    await saveSearchProvider({ ...provider, enabled: false });
    await recordSearch({
      query: 'free tours con niños',
      context: { kind: 'Zona del destino', label: 'Centro', query: 'Centro, Roma' },
      providerId: provider.id,
    });
    await savePlace({
      name: 'Lugar de prueba',
      address: 'Centro, Roma',
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

  it('rellena el viaje desde una vista previa de PDF sin guardar el archivo', async () => {
    await restoreInitialData();
    const draft = parseTravelDocumentText([
      'ROMA EN FAMILIA · 3-5 SEPTIEMBRE 2027\n' +
      'Llegada: Iberia IB1234, Madrid-Roma, viernes 3 de septiembre (08:00-10:30).\n' +
      'ALOJAMIENTO 1\nHotel Central\nVia de Ejemplo 10\n' +
      '3. Itinerario diario\nDía 1 · Viernes 3 · Centro\nHora Plan Coste / reserva\n' +
      '11:30 Paseo por la plaza principal. Gratis\n14:00 Comida en restaurante local. €12-€18 adulto\n',
    ], 'ejemplo.pdf');
    await applyPdfImport(draft, 'replace');
    const snapshot = await getSnapshot();
    expect(snapshot.activeTrip.destination).toBe('Roma');
    expect(snapshot.activities).toHaveLength(2);
    expect(snapshot.accommodations[0].name).toBe('Hotel Central');
    expect(snapshot.flights[0].flightNumber).toBe('IB1234');
    expect(snapshot.documents).toEqual([]);
  });
});
