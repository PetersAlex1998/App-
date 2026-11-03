import React from 'react';
import { useCompat } from '../nav';
import { ExpensesScreen } from '../screens/Expenses';

export default function Route() {
  return <ExpensesScreen {...useCompat()} />;
}
