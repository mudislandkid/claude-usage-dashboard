import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { checkForUpdates } from './lib/updater';
import './index.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: { refetchInterval: 30_000, staleTime: 15_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

// Fire-and-forget update check 3s after mount (don't block initial paint).
setTimeout(() => {
  void checkForUpdates();
}, 3000);
