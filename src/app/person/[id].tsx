import React from 'react';
import { useCompat } from '../../nav';
import { TenantDetail } from '../../screens/Details';

export default function Route() {
  return <TenantDetail {...useCompat()} />;
}
