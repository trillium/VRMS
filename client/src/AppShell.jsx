import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SnackbarProvider } from './context/snackbarContext';

// The app root shared by both build paths: src/index.jsx (Vite) and
// src/nextEntry.jsx (Next catch-all route).
export default function AppShell() {
  return (
    <BrowserRouter>
      <SnackbarProvider>
        <App />
      </SnackbarProvider>
    </BrowserRouter>
  );
}
