import React from 'react';
import { useCompat } from '../../nav';
import { CalculatorList } from '../../screens/Calculator';

export default function Route() {
  return <CalculatorList {...useCompat()} />;
}
