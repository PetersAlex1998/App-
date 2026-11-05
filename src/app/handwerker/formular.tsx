import React from 'react';
import { useCompat } from '../../nav';
import { ContractorForm } from '../../screens/Issues';

export default function Route() {
  return <ContractorForm {...useCompat()} />;
}
