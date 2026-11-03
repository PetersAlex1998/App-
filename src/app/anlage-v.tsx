import React from 'react';
import { useCompat } from '../nav';
import { AnlageVScreen } from '../screens/Expenses';

export default function Route() {
  return <AnlageVScreen {...useCompat()} />;
}
