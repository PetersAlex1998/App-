import React from 'react';
import { useCompat } from '../nav';
import { Portfolio } from '../screens/Portfolio';

export default function Route() {
  return <Portfolio {...useCompat()} />;
}
