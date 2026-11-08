import React from 'react';
import { useCompat } from '../nav';
import { Eigentuemerabrechnung } from '../screens/OwnerStatements';

export default function Route() {
  return <Eigentuemerabrechnung {...useCompat()} />;
}
