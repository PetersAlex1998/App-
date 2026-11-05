import React from 'react';
import { useCompat } from '../nav';
import { HouseSetup } from '../screens/HouseSetup';

export default function Route() {
  return <HouseSetup {...useCompat()} />;
}
