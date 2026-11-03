import React from 'react';
import { useCompat } from '../../nav';
import { Dashboard } from '../../screens/Lists';

export default function Route() {
  return <Dashboard {...useCompat()} />;
}
