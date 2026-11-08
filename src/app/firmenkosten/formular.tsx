import React from 'react';
import { useCompat } from '../../nav';
import { FirmCostForm } from '../../screens/FirmBilling';

export default function Route() {
  return <FirmCostForm {...useCompat()} />;
}
