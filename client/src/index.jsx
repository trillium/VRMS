import React from 'react';
import ReactDOM from 'react-dom';
import './index.scss';
import './tailwind.css';
import AppShell from './AppShell';
import posthog from 'posthog-js';

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_POSTHOG_HOST,
  autocapture: false,
  capture_pageview: false,
});

ReactDOM.render(<AppShell />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
// serviceWorker.unregister();
