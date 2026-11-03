import React from 'react';
import { useCompat } from '../nav';
import { StatementImport } from '../screens/Imports';

export default function Route() {
  return <StatementImport {...useCompat()} />;
}
