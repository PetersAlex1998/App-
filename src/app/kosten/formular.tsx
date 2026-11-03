import React from 'react';
import { useCompat } from '../../nav';
import { CostForm } from '../../screens/Forms';

export default function Route() {
  return <CostForm {...useCompat()} />;
}
