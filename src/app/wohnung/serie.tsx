import React from 'react';
import { useCompat } from '../../nav';
import { UnitSeries } from '../../screens/Forms';

export default function Route() {
  return <UnitSeries {...useCompat()} />;
}
