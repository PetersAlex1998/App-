import React from 'react';
import { useCompat } from '../../nav';
import { PropertyDetail } from '../../screens/Details';

export default function Route() {
  return <PropertyDetail {...useCompat()} />;
}
