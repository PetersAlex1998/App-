import React from 'react';
import { useCompat } from '../../nav';
import { Firmenkosten } from '../../screens/FirmBilling';

export default function Route() {
  return <Firmenkosten {...useCompat()} />;
}
