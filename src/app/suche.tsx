import React from 'react';
import { useCompat } from '../nav';
import { SearchScreen } from '../screens/Search';

export default function Route() {
  return <SearchScreen {...useCompat()} />;
}
