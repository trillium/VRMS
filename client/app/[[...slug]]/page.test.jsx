import { cleanup, render, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './page';

// Stand in for the real screens: it only reports what the app shell wraps it in,
// namely the browser router (current path) and the snackbar provider.
vi.mock('../../src/App', () => ({
  default: function AppStub() {
    const { pathname } = useLocation();
    return <div data-testid="app-shell">{pathname}</div>;
  },
}));

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

describe('catch-all route', () => {
  it('renders the React Router app shell at /', async () => {
    window.history.pushState({}, '', '/');
    render(<Page />);
    const shell = await screen.findByTestId('app-shell');
    expect(shell.textContent).toBe('/');
  });

  it('hands a deep link to React Router so it can pick the screen', async () => {
    window.history.pushState({}, '', '/event/abc123');
    render(<Page />);
    const shell = await screen.findByTestId('app-shell');
    expect(shell.textContent).toBe('/event/abc123');
  });
});
