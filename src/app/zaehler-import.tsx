import React from 'react';
import { useCompat } from '../nav';
import { ZaehlerImport } from '../screens/Imports';

export default function Route() {
  return <ZaehlerImport {...useCompat()} />;
}
