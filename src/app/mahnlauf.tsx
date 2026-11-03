import React from 'react';
import { useCompat } from '../nav';
import { Mahnlauf } from '../screens/Mahnlauf';

export default function Route() {
  return <Mahnlauf {...useCompat()} />;
}
