import React from 'react';
import { useCompat } from '../../nav';
import { ReadingForm } from '../../screens/Meters';

export default function Route() {
  return <ReadingForm {...useCompat()} />;
}
