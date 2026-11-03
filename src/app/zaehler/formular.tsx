import React from 'react';
import { useCompat } from '../../nav';
import { MeterForm } from '../../screens/Meters';

export default function Route() {
  return <MeterForm {...useCompat()} />;
}
