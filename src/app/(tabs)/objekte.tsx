import React from 'react';
import { useCompat } from '../../nav';
import { Properties } from '../../screens/Lists';

export default function Route() {
  return <Properties {...useCompat()} />;
}
