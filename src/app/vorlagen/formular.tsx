import React from 'react';
import { useCompat } from '../../nav';
import { VorlageForm } from '../../screens/Vorlagen';

export default function Route() {
  return <VorlageForm {...useCompat()} />;
}
