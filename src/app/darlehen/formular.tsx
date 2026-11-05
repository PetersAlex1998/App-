import React from 'react';
import { useCompat } from '../../nav';
import { LoanForm } from '../../screens/Loans';

export default function Route() {
  return <LoanForm {...useCompat()} />;
}
