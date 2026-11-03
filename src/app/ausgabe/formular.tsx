import React from 'react';
import { useCompat } from '../../nav';
import { ExpenseForm } from '../../screens/Expenses';

export default function Route() {
  return <ExpenseForm {...useCompat()} />;
}
