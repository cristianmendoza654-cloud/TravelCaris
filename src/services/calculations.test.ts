import { describe, expect, it } from 'vitest';
import type { Expense } from '../domain/types';
import { expenseTotals } from './calculations';

describe('expense totals', () => {
  it('calcula totales por día y categoría con cambio manual', () => {
    const expenses: Expense[] = [
      { id: '1', tripId: 'trip-london-2026', concept: 'Metro', category: 'Transporte', date: '2026-08-01', amount: 20, currency: 'GBP', paidBy: 'A', paymentMethod: 'Tarjeta', notes: '' },
      { id: '2', tripId: 'trip-london-2026', concept: 'Cena', category: 'Comida', date: '2026-08-01', amount: 23.6, currency: 'EUR', paidBy: 'A', paymentMethod: 'Tarjeta', notes: '' },
    ];
    const totals = expenseTotals(expenses, 1.18);
    expect(totals.totalGbp).toBeCloseTo(40);
    expect(totals.byDay['2026-08-01']).toBeCloseTo(40);
    expect(totals.byCategory.Transporte).toBeCloseTo(20);
  });
});
