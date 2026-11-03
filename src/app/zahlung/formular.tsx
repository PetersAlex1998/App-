import React from 'react';
import { useCompat } from '../../nav';
import { PaymentForm } from '../../screens/Forms';

export default function Route() {
  return <PaymentForm {...useCompat()} />;
}
