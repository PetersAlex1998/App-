import React from 'react';
import { useCompat } from '../../nav';
import { UnitDetail } from '../../screens/Details';

export default function Route() {
  return <UnitDetail {...useCompat()} />;
}
