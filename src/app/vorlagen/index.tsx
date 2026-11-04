import React from 'react';
import { useCompat } from '../../nav';
import { Vorlagen } from '../../screens/Vorlagen';

export default function Route() {
  return <Vorlagen {...useCompat()} />;
}
