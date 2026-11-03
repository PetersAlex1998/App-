import React from 'react';
import { useCompat } from '../../nav';
import { Payments } from '../../screens/Lists';

export default function Route() {
  return <Payments {...useCompat()} />;
}
