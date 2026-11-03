import React from 'react';
import { useCompat } from '../nav';
import { Outbox } from '../screens/Outbox';

export default function Route() {
  return <Outbox {...useCompat()} />;
}
