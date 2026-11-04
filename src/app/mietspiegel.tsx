import React from 'react';
import { useCompat } from '../nav';
import { MietspiegelScreen } from '../screens/Mietspiegel';

export default function Route() {
  return <MietspiegelScreen {...useCompat()} />;
}
