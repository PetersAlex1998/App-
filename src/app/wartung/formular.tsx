import React from 'react';
import { useCompat } from '../../nav';
import { CheckForm } from '../../screens/Checks';

export default function Route() {
  return <CheckForm {...useCompat()} />;
}
