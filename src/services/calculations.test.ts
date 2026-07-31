import { describe, expect, it } from 'vitest';
import type { Expense } from '../domain/types';
import { convertTripCurrency, expenseTotals, formatMoney } from './calculations';

describe('expense totals', () => {
  it('calcula totales por día y categoría entre moneda de destino y viajero', () => {
    const expenses: Expense[] = [
      { id: '1', tripId: 'trip-london-2026', concept: 'Metro', category: 'Transporte', date: '2026-08-01', amount: 20, currency: 'GBP', paidBy: 'A', paymentMethod: 'Tarjeta', notes: '' },
      { id: '2', tripId: 'trip-london-2026', concept: 'Cena', category: 'Comida', date: '2026-08-01', amount: 23.6, currency: 'EUR', paidBy: 'A', paymentMethod: 'Tarjeta', notes: '' },
    ];
    const totals = expenseTotals(expenses, 'GBP', 'EUR', 1.18);
    expect(totals.totalDestination).toBeCloseTo(40);
    expect(totals.totalTraveller).toBeCloseTo(47.2);
    expect(totals.byDay['2026-08-01']).toBeCloseTo(40);
    expect(totals.byCategory.Transporte).toBeCloseTo(20);
  });

  it('convierte en ambos sentidos y detecta monedas fuera del par', () => {
    expect(convertTripCurrency(10, 'GBP', 'EUR', 'GBP', 'EUR', 1.2)).toBeCloseTo(12);
    expect(convertTripCurrency(12, 'EUR', 'GBP', 'GBP', 'EUR', 1.2)).toBeCloseTo(10);
    expect(convertTripCurrency(10, 'USD', 'EUR', 'GBP', 'EUR', 1.2)).toBeNull();
    expect(formatMoney(12.5, 'EUR')).toContain('12,50');
  });
});
