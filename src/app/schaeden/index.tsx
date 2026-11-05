import React from 'react';
import { useCompat } from '../../nav';
import { Schaeden } from '../../screens/Issues';

export default function Route() {
  return <Schaeden {...useCompat()} />;
}
