import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { installFetchRouter, jsonResponse, mockUser } from './mocks';

function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('top-level authentication routing', () => {
  it('finishes the session check and redirects an unauthenticated visitor to sign in', async () => {
    const { getCalls } = installFetchRouter([
      {
        method: 'GET',
        prefix: '/api/auth/me',
        respond: () =>
          jsonResponse(
            { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
            401,
          ),
      },
    ]);

    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('Checking session…')).not.toBeInTheDocument();
    expect(getCalls().filter((call) => call.url === '/api/auth/me')).toHaveLength(1);
  });

  it('renders the protected application shell for an authenticated visitor', async () => {
    installFetchRouter([
      {
        method: 'GET',
        prefix: '/api/auth/me',
        respond: () => jsonResponse({ user: mockUser() }),
      },
      {
        method: 'GET',
        prefix: '/api/projects',
        respond: () => jsonResponse({ projects: [] }),
      },
    ]);

    renderApp('/projects');

    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Owner')).toBeInTheDocument();
    });
    expect(screen.queryByText('Checking session…')).not.toBeInTheDocument();
  });
});
