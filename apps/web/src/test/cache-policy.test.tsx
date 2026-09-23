import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api/client';
import {
  queryKeys,
  useArchiveTicket,
  useCreateTicket,
  useMoveTicket,
  usePatchTicket,
} from '@/api/hooks';
import { installFetchRouter, jsonResponse, mockTicket } from './mocks';

function setupQueryClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidate, wrapper };
}

function expectTicketViewsInvalidated(invalidate: unknown): void {
  expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.board('proj-1') });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['list', 'proj-1'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard('proj-1') });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['focus'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.accomplishments('proj-1') });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('API request cache defense', () => {
  it('centralizes no-store on API GET requests', async () => {
    const { fetchMock } = installFetchRouter([
      { method: 'GET', prefix: '/api/projects', respond: () => jsonResponse({ projects: [] }) },
    ]);

    await api.get('/api/projects');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({ method: 'GET', cache: 'no-store', credentials: 'include' }),
    );
  });
});

describe('ticket-derived query invalidation', () => {
  it('refreshes Board, List, project summary, Dashboard, Focus, and Accomplishments after create', async () => {
    installFetchRouter([
      {
        method: 'POST',
        prefix: '/api/projects/proj-1/tickets',
        respond: () => jsonResponse({ ticket: mockTicket() }, 201),
      },
    ]);
    const { invalidate, wrapper } = setupQueryClient();
    const { result } = renderHook(() => useCreateTicket('proj-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ title: 'Production cache hotfix' });
    });

    expectTicketViewsInvalidated(invalidate);
  });

  it('refreshes derived views after lifecycle and block changes', async () => {
    installFetchRouter([
      {
        method: 'PATCH',
        prefix: '/api/tickets/tkt-1',
        respond: () =>
          jsonResponse({ ticket: mockTicket({ status: 'IN_PROGRESS', isBlocked: true }) }),
      },
    ]);
    const { invalidate, wrapper } = setupQueryClient();
    const { result } = renderHook(() => usePatchTicket('tkt-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        version: 1,
        status: 'IN_PROGRESS',
        isBlocked: true,
        blockedReason: 'Production acceptance test',
      });
    });

    expectTicketViewsInvalidated(invalidate);
  });

  it('refreshes derived views after board status movement', async () => {
    installFetchRouter([
      {
        method: 'PATCH',
        prefix: '/api/tickets/tkt-1',
        respond: () => jsonResponse({ ticket: mockTicket({ status: 'TESTED' }) }),
      },
    ]);
    const { invalidate, wrapper } = setupQueryClient();
    const { result } = renderHook(() => useMoveTicket('proj-1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ticketId: 'tkt-1', version: 1, status: 'TESTED' });
    });

    expectTicketViewsInvalidated(invalidate);
  });

  it('refreshes derived views after archive or restore', async () => {
    installFetchRouter([
      {
        method: 'POST',
        prefix: '/api/tickets/tkt-1/archive',
        respond: () =>
          jsonResponse({ ticket: mockTicket({ archivedAt: '2026-09-23T00:00:00.000Z' }) }),
      },
    ]);
    const { invalidate, wrapper } = setupQueryClient();
    const { result } = renderHook(() => useArchiveTicket(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ ticketId: 'tkt-1', shouldArchive: true });
    });

    expectTicketViewsInvalidated(invalidate);
  });
});
