import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthContext';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { installFetchRouter, jsonResponse, mockUser } from './mocks';

function renderRegister() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/register']}>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RegisterPage', () => {
  it('offers account registration when the server policy is open', async () => {
    const { getCalls } = installFetchRouter([
      { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: null }) },
      {
        method: 'GET',
        prefix: '/api/auth/registration-status',
        respond: () => jsonResponse({ open: true }),
      },
    ]);

    renderRegister();

    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByText('Your projects and tickets stay private to your account.')).toBeInTheDocument();
    expect(getCalls().some((call) => call.url === '/api/auth/registration-status')).toBe(true);
  });

  it('hides the form when registration is closed by server policy', async () => {
    installFetchRouter([
      { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: null }) },
      {
        method: 'GET',
        prefix: '/api/auth/registration-status',
        respond: () => jsonResponse({ open: false }),
      },
    ]);

    renderRegister();

    expect(await screen.findByText('Registration is closed.')).toBeInTheDocument();
    expect(screen.queryByTestId('register-submit')).not.toBeInTheDocument();
  });

  it('submits a new user email and password', async () => {
    const user = userEvent.setup();
    const { getCalls } = installFetchRouter([
      { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: null }) },
      {
        method: 'GET',
        prefix: '/api/auth/registration-status',
        respond: () => jsonResponse({ open: true }),
      },
      {
        method: 'POST',
        prefix: '/api/auth/register',
        respond: (_url, body) => {
          expect(body).toEqual({
            email: 'colleague@zakisu.test',
            password: 'colleague-password-1',
          });
          return jsonResponse({ user: mockUser({ email: 'colleague@zakisu.test' }) }, 201);
        },
      },
    ]);

    renderRegister();
    await user.type(await screen.findByTestId('register-email'), 'colleague@zakisu.test');
    await user.type(screen.getByTestId('register-password'), 'colleague-password-1');
    await user.click(screen.getByTestId('register-submit'));

    await waitFor(() => {
      expect(
        getCalls().some(
          (call) => call.method === 'POST' && call.url.startsWith('/api/auth/register'),
        ),
      ).toBe(true);
    });
  });

  it('shows a server registration error', async () => {
    const user = userEvent.setup();
    installFetchRouter([
      { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: null }) },
      {
        method: 'GET',
        prefix: '/api/auth/registration-status',
        respond: () => jsonResponse({ open: true }),
      },
      {
        method: 'POST',
        prefix: '/api/auth/register',
        respond: () =>
          jsonResponse(
            { error: { code: 'CONFLICT', message: 'An account with this email already exists' } },
            409,
          ),
      },
    ]);

    renderRegister();
    await user.type(await screen.findByTestId('register-email'), 'owner@zakisu.test');
    await user.type(screen.getByTestId('register-password'), 'owner-password-1');
    await user.click(screen.getByTestId('register-submit'));

    expect(await screen.findByTestId('register-error')).toHaveTextContent(
      'An account with this email already exists',
    );
  });
});
