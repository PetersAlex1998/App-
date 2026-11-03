import React from 'react';
import { useCompat } from '../../nav';
import { PropertyForm } from '../../screens/Forms';

export default function Route() {
  return <PropertyForm {...useCompat()} />;
}
