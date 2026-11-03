import React from 'react';
import { useCompat } from '../../nav';
import { Cockpit } from '../../screens/Cockpit';

export default function Route() {
  return <Cockpit {...useCompat()} />;
}
