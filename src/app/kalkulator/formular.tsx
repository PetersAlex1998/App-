import React from 'react';
import { useCompat } from '../../nav';
import { CalculatorForm } from '../../screens/Calculator';

export default function Route() {
  return <CalculatorForm {...useCompat()} />;
}
