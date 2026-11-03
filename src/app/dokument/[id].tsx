import React from 'react';
import { useCompat } from '../../nav';
import { DocumentViewer } from '../../screens/Documents';

export default function Route() {
  return <DocumentViewer {...useCompat()} />;
}
