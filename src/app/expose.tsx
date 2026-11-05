import React from 'react';
import { useCompat } from '../nav';
import { Expose } from '../screens/Expose';

export default function Route() {
  return <Expose {...useCompat()} />;
}
