import React from 'react';
import { useCompat } from '../../nav';
import { Modules } from '../../screens/Lists';

export default function Route() {
  return <Modules {...useCompat()} />;
}
