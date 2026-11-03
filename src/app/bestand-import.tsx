import React from 'react';
import { useCompat } from '../nav';
import { BestandImport } from '../screens/Imports';

export default function Route() {
  return <BestandImport {...useCompat()} />;
}
