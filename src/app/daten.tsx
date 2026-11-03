import React from 'react';
import { useCompat } from '../nav';
import { DataScreen } from '../screens/Data';

export default function Route() {
  return <DataScreen {...useCompat()} />;
}
