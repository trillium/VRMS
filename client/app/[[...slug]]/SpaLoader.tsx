'use client';

import dynamic from 'next/dynamic';

// The existing app was written for the browser only (window, localStorage, MUI,
// react-router v5 BrowserRouter), so it is never rendered on the server.
const SpaApp = dynamic(() => import('../../src/nextEntry'), {
  ssr: false,
  loading: () => null,
});

export default function SpaLoader() {
  return <SpaApp />;
}
