import type { Expense } from '../domain/types';

export function expenseTotals(expenses: Expense[], gbpToEur: number) {
  const totalGbp = expenses.reduce((sum, expense) => {
    return sum + (expense.currency === 'GBP' ? expense.amount : expense.amount / gbpToEur);
  }, 0);
  const byDay = groupTotal(expenses, 'date', gbpToEur);
  const byCategory = groupTotal(expenses, 'category', gbpToEur);
  return {
    totalGbp,
    totalEur: totalGbp * gbpToEur,
    byDay,
    byCategory,
  };
}

function groupTotal(expenses: Expense[], key: 'date' | 'category', gbpToEur: number) {
  return expenses.reduce<Record<string, number>>((accumulator, expense) => {
    const value = expense.currency === 'GBP' ? expense.amount : expense.amount / gbpToEur;
    accumulator[expense[key]] = (accumulator[expense[key]] ?? 0) + value;
    return accumulator;
  }, {});
}
