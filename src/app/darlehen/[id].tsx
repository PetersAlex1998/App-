import React from 'react';
import { useCompat } from '../../nav';
import { LoanDetail } from '../../screens/Loans';

export default function Route() {
  return <LoanDetail {...useCompat()} />;
}
