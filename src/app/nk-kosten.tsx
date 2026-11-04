import React from 'react';
import { useCompat } from '../nav';
import { NkKosten } from '../screens/NkKosten';

export default function Route() {
  return <NkKosten {...useCompat()} />;
}
