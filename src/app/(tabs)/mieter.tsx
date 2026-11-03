import React from 'react';
import { useCompat } from '../../nav';
import { Tenants } from '../../screens/Lists';

export default function Route() {
  return <Tenants {...useCompat()} />;
}
