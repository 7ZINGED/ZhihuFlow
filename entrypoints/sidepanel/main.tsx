import React from 'react';
import ReactDOM from 'react-dom/client';
import { Dashboard } from '../../src/views/Dashboard';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import '../../src/styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  </React.StrictMode>
);
