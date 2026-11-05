import React from 'react';
import { useCompat } from '../../nav';
import { IssueForm } from '../../screens/Issues';

export default function Route() {
  return <IssueForm {...useCompat()} />;
}
