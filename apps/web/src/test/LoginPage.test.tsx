import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { installFetchRouter, jsonResponse, mockUser } from './mocks';

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it('renders email and password fields', () => {
    installFetchRouter([
      { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: null }) },
    ]);
    renderLogin();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('submits credentials to the login endpoint', async () => {
    const user = userEvent.setup();
    const { getCalls } = installFetchRouter([
      { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: null }) },
      {
        method: 'POST',
        prefix: '/api/auth/login',
        respond: (_url, body) => {
          expect(body).toEqual({ email: 'owner@zakisu.test', password: 'secret-pass-1' });
          return jsonResponse({ user: mockUser() });
        },
      },
    ]);

    renderLogin();
    await user.type(screen.getByTestId('login-email'), 'owner@zakisu.test');
    await user.type(screen.getByTestId('login-password'), 'secret-pass-1');
    await user.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(getCalls().some((c) => c.method === 'POST' && c.url.startsWith('/api/auth/login'))).toBe(true);
    });
  });

  it('shows the generic server error on bad credentials', async () => {
    const user = userEvent.setup();
    installFetchRouter([
      { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: null }) },
      {
        method: 'POST',
        prefix: '/api/auth/login',
        respond: () =>
          jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password' } }, 401),
      },
    ]);

    renderLogin();
    await user.type(screen.getByTestId('login-email'), 'owner@zakisu.test');
    await user.type(screen.getByTestId('login-password'), 'wrong-password');
    await user.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('login-error')).toHaveTextContent('Invalid email or password');
    });
  });
});
