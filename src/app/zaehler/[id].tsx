import React from 'react';
import { useCompat } from '../../nav';
import { MeterDetail } from '../../screens/Meters';

export default function Route() {
  return <MeterDetail {...useCompat()} />;
}
