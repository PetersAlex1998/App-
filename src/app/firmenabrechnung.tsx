import React from 'react';
import { useCompat } from '../nav';
import { FirmenAbrechnung } from '../screens/FirmBilling';

export default function Route() {
  return <FirmenAbrechnung {...useCompat()} />;
}
