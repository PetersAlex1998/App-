import React from 'react';
import { useCompat } from '../../nav';
import { Wartung } from '../../screens/Checks';

export default function Route() {
  return <Wartung {...useCompat()} />;
}
