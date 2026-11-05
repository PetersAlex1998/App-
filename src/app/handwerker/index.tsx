import React from 'react';
import { useCompat } from '../../nav';
import { Handwerker } from '../../screens/Issues';

export default function Route() {
  return <Handwerker {...useCompat()} />;
}
