import React from 'react';
import { useCompat } from '../nav';
import { BriefeSettings } from '../screens/BriefeSettings';

export default function Route() {
  return <BriefeSettings {...useCompat()} />;
}
