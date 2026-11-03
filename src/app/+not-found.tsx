import React from 'react';
import { Redirect } from 'expo-router';

/** Unbekannte Adresse (z. B. alter Link): zur Übersicht. */
export default function NotFound() {
  return <Redirect href="/" />;
}
