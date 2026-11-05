import React from 'react';
import { useCompat } from '../nav';
import { Kautionen } from '../screens/Deposits';

export default function Route() {
  return <Kautionen {...useCompat()} />;
}
