import React from 'react';
import { useCompat } from '../nav';
import { Ablesung } from '../screens/Meters';

export default function Route() {
  return <Ablesung {...useCompat()} />;
}
