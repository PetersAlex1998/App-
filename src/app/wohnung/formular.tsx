import React from 'react';
import { useCompat } from '../../nav';
import { UnitForm } from '../../screens/Forms';

export default function Route() {
  return <UnitForm {...useCompat()} />;
}
