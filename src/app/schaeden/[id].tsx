import React from 'react';
import { useCompat } from '../../nav';
import { IssueDetail } from '../../screens/Issues';

export default function Route() {
  return <IssueDetail {...useCompat()} />;
}
