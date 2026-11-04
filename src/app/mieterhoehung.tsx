import React from 'react';
import { useCompat } from '../nav';
import { Mieterhoehung } from '../screens/Mieterhoehung';

export default function Route() {
  return <Mieterhoehung {...useCompat()} />;
}
