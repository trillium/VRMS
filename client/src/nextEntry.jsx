import posthog from 'posthog-js';
import AppShell from './AppShell';

// Next inlines NEXT_PUBLIC_* at build time (the Vite build reads VITE_POSTHOG_*).
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    autocapture: false,
    capture_pageview: false,
  });
}

export default AppShell;
