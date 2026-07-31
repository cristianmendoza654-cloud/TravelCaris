import type { Expense } from '../domain/types';

export function expenseTotals(expenses: Expense[], destinationCurrency: string, travellerCurrency: string, exchangeRate: number) {
  let unconvertedCount = 0;
  const totalDestination = expenses.reduce((sum, expense) => {
    const value = convertTripCurrency(expense.amount, expense.currency, destinationCurrency, destinationCurrency, travellerCurrency, exchangeRate);
    if (value === null) unconvertedCount += 1;
    return sum + (value ?? 0);
  }, 0);
  const byDay = groupTotal(expenses, 'date', destinationCurrency, travellerCurrency, exchangeRate);
  const byCategory = groupTotal(expenses, 'category', destinationCurrency, travellerCurrency, exchangeRate);
  return {
    totalDestination,
    totalTraveller: convertTripCurrency(totalDestination, destinationCurrency, travellerCurrency, destinationCurrency, travellerCurrency, exchangeRate) ?? totalDestination,
    unconvertedCount,
    byDay,
    byCategory,
  };
}

export function convertTripCurrency(
  amount: number,
  from: string,
  to: string,
  destinationCurrency: string,
  travellerCurrency: string,
  exchangeRate: number,
): number | null {
  if (from === to) return amount;
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return null;
  if (from === destinationCurrency && to === travellerCurrency) return amount * exchangeRate;
  if (from === travellerCurrency && to === destinationCurrency) return amount / exchangeRate;
  return null;
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function groupTotal(expenses: Expense[], key: 'date' | 'category', destinationCurrency: string, travellerCurrency: string, exchangeRate: number) {
  return expenses.reduce<Record<string, number>>((accumulator, expense) => {
    const value = convertTripCurrency(expense.amount, expense.currency, destinationCurrency, destinationCurrency, travellerCurrency, exchangeRate);
    if (value !== null) accumulator[expense[key]] = (accumulator[expense[key]] ?? 0) + value;
    return accumulator;
  }, {});
}
