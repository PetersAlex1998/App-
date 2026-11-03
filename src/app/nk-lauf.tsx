import React from 'react';
import { useCompat } from '../nav';
import { NkLauf } from '../screens/NkLauf';

export default function Route() {
  return <NkLauf {...useCompat()} />;
}
