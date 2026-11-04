import React from 'react';
import { useCompat } from '../nav';
import { MieterhoehungPotenzial } from '../screens/MieterhoehungPotenzial';

export default function Route() {
  return <MieterhoehungPotenzial {...useCompat()} />;
}
