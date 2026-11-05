import React from 'react';
import { useCompat } from '../../nav';
import { CheckDetail } from '../../screens/Checks';

export default function Route() {
  return <CheckDetail {...useCompat()} />;
}
