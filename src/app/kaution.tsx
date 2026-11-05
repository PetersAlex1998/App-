import React from 'react';
import { useCompat } from '../nav';
import { Kaution } from '../screens/Deposits';

export default function Route() {
  return <Kaution {...useCompat()} />;
}
