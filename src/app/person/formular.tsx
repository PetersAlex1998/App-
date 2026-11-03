import React from 'react';
import { useCompat } from '../../nav';
import { TenantForm } from '../../screens/Forms';

export default function Route() {
  return <TenantForm {...useCompat()} />;
}
