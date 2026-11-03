import React from 'react';
import { useCompat } from '../../nav';
import { DocumentForm } from '../../screens/Documents';

export default function Route() {
  return <DocumentForm {...useCompat()} />;
}
