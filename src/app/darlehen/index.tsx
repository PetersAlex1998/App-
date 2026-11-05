import React from 'react';
import { useCompat } from '../../nav';
import { Darlehen } from '../../screens/Loans';

export default function Route() {
  return <Darlehen {...useCompat()} />;
}
