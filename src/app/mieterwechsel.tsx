import React from 'react';
import { useCompat } from '../nav';
import { Mieterwechsel } from '../screens/Mieterwechsel';

export default function Route() {
  return <Mieterwechsel {...useCompat()} />;
}
