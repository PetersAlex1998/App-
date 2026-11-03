import React from 'react';
import { useCompat } from '../nav';
import { TasksScreen } from '../screens/Tasks';

export default function Route() {
  return <TasksScreen {...useCompat()} />;
}
