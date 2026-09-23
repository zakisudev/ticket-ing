import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthContext';
import { BoardPage } from '@/features/tickets/BoardPage';
import { queryKeys, useBoard, useMoveTicket } from '@/api/hooks';
import {
  installFetchRouter,
  jsonResponse,
  mockBoard,
  mockProject,
  mockTicket,
  mockUser,
} from './mocks';

function renderBoard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/p/temarione/board']}>
        <AuthProvider>
          <Routes>
            <Route path="/p/:slug/board" element={<BoardPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

let boardState = mockBoard([]);

beforeEach(() => {
  boardState = mockBoard([
    mockTicket({ id: 'tkt-1', displayId: 'TMR-001', title: 'First ticket', status: 'PLANNED' }),
    mockTicket({ id: 'tkt-2', displayId: 'TMR-002', title: 'Working item', status: 'IN_PROGRESS' }),
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BoardPage', () => {
  it('renders all six columns with project tickets in the right places', async () => {
    installFetchRouter([
      { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: mockUser() }) },
      { method: 'GET', prefix: '/api/projects/proj-1/tickets/board', respond: () => jsonResponse(boardState) },
      { method: 'GET', prefix: '/api/projects', respond: () => jsonResponse({ projects: [mockProject()] }) },
    ]);

    renderBoard();

    await waitFor(() => {
      expect(screen.getByTestId('ticket-card-TMR-001')).toBeInTheDocument();
    });
    expect(screen.getByTestId('ticket-card-TMR-002')).toBeInTheDocument();
    for (const status of ['PLANNED', 'IN_PROGRESS', 'IMPLEMENTED', 'TESTED', 'DEPLOYED', 'BLOCKED']) {
      expect(screen.getByTestId(`board-column-${status}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('board-column-PLANNED')).toContainElement(screen.getByTestId('ticket-card-TMR-001'));
    expect(screen.getByTestId('board-column-IN_PROGRESS')).toContainElement(screen.getByTestId('ticket-card-TMR-002'));
  });

  it('quick-creates a ticket with defaults via the API', async () => {
    const user = userEvent.setup();
    installFetchRouter([
      { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: mockUser() }) },
      { method: 'GET', prefix: '/api/projects/proj-1/tickets/board', respond: () => jsonResponse(boardState) },
      { method: 'GET', prefix: '/api/projects', respond: () => jsonResponse({ projects: [mockProject()] }) },
      {
        method: 'POST',
        prefix: '/api/projects/proj-1/tickets',
        respond: (_url, body) => {
          expect(body).toEqual({ title: 'Brand new ticket' });
          const created = mockTicket({ id: 'tkt-3', displayId: 'TMR-003', title: 'Brand new ticket' });
          boardState = {
            board: {
              ...boardState.board,
              columns: boardState.board.columns.map((c) =>
                c.status === 'PLANNED' ? { ...c, tickets: [...c.tickets, created] } : c
              ),
            },
          };
          return jsonResponse({ ticket: created }, 201);
        },
      },
    ]);

    renderBoard();
    await waitFor(() => expect(screen.getByTestId('quick-create-open')).toBeInTheDocument());

    await user.click(screen.getByTestId('quick-create-open'));
    await user.type(screen.getByTestId('quick-create-input'), 'Brand new ticket');
    await user.click(screen.getByTestId('quick-create-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('ticket-card-TMR-003')).toBeInTheDocument();
    });
  });
});

/**
 * Harness driving useMoveTicket directly to verify optimistic update + rollback.
 * dnd-kit drag itself is browser-gesture behavior; the correctness contract lives
 * in the mutation (optimistic move, rollback on failure, refetch on conflict).
 */
function MoveHarness({ onReady }: { onReady: (move: (vars: { ticketId: string; version: number; status: string }) => Promise<unknown>) => void }) {
  const move = useMoveTicket('proj-1');
  useBoard('proj-1'); // registers the query so the cache is populated for assertions
  onReady((vars) => move.mutateAsync(vars));
  return null;
}

function renderMoveHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let moveFn: ((vars: { ticketId: string; version: number; status: string }) => Promise<unknown>) | null = null;
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AuthProvider>
          <MoveHarness onReady={(fn) => (moveFn = fn)} />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return {
    qc,
    move: (vars: { ticketId: string; version: number; status: string }) => {
      if (!moveFn) throw new Error('harness not ready');
      return moveFn(vars);
    },
  };
}

function ticketLocation(qc: QueryClient, ticketId: string): string | null {
  const data = qc.getQueryData<{ board: ReturnType<typeof mockBoard>['board'] }>(queryKeys.board('proj-1'));
  const col = data?.board.columns.find((c) => c.tickets.some((t) => t.id === ticketId));
  return col?.status ?? null;
}

describe('useMoveTicket optimistic semantics', () => {
  beforeEach(() => {
    boardState = mockBoard([
      mockTicket({ id: 'tkt-1', displayId: 'TMR-001', title: 'First ticket', status: 'PLANNED' }),
    ]);
  });

  it('moves optimistically on success', async () => {
    installFetchRouter([
      { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: mockUser() }) },
      { method: 'GET', prefix: '/api/projects/proj-1/tickets/board', respond: () => jsonResponse(boardState) },
      { method: 'GET', prefix: '/api/projects', respond: () => jsonResponse({ projects: [mockProject()] }) },
      {
        method: 'PATCH',
        prefix: '/api/tickets/tkt-1',
        respond: () => {
          // Server accepts and now serves the ticket in the new column.
          boardState = {
            board: {
              ...boardState.board,
              columns: boardState.board.columns.map((c) =>
                c.status === 'PLANNED'
                  ? { ...c, tickets: c.tickets.filter((t) => t.id !== 'tkt-1') }
                  : c.status === 'TESTED'
                    ? { ...c, tickets: [ ...c.tickets, { ...c.tickets[0], id: 'tkt-1', status: 'TESTED' } ] }
                    : c
              ),
            },
          };
          return jsonResponse({ ticket: mockTicket({ status: 'TESTED' }) });
        },
      },
    ]);

    const { qc, move } = renderMoveHarness();
    await qc.refetchQueries({ queryKey: queryKeys.board('proj-1') });
    expect(ticketLocation(qc, 'tkt-1')).toBe('PLANNED');

    await move({ ticketId: 'tkt-1', version: 1, status: 'TESTED' });
    await waitFor(() => expect(ticketLocation(qc, 'tkt-1')).toBe('TESTED'));
  });

  it('rolls back to the original column when the PATCH fails', async () => {
    installFetchRouter([
      { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: mockUser() }) },
      { method: 'GET', prefix: '/api/projects/proj-1/tickets/board', respond: () => jsonResponse(boardState) },
      { method: 'GET', prefix: '/api/projects', respond: () => jsonResponse({ projects: [mockProject()] }) },
      {
        method: 'PATCH',
        prefix: '/api/tickets/tkt-1',
        respond: () => jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }, 500),
      },
    ]);

    const { qc, move } = renderMoveHarness();
    await qc.refetchQueries({ queryKey: queryKeys.board('proj-1') });
    expect(ticketLocation(qc, 'tkt-1')).toBe('PLANNED');

    await expect(move({ ticketId: 'tkt-1', version: 1, status: 'DEPLOYED' })).rejects.toBeTruthy();
    // Rollback restored the pre-drag snapshot; the card is NOT left in DEPLOYED.
    await waitFor(() => expect(ticketLocation(qc, 'tkt-1')).toBe('PLANNED'));
  });

  it('on STALE_UPDATE rolls back and the refetch picks up the server truth', async () => {
    const serverTruth = mockBoard([
      mockTicket({ id: 'tkt-1', displayId: 'TMR-001', title: 'Edited elsewhere', status: 'IN_PROGRESS', version: 7 }),
    ]);
    installFetchRouter([
      { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: mockUser() }) },
      { method: 'GET', prefix: '/api/projects/proj-1/tickets/board', respond: () => jsonResponse(serverTruth) },
      { method: 'GET', prefix: '/api/projects', respond: () => jsonResponse({ projects: [mockProject()] }) },
      {
        method: 'PATCH',
        prefix: '/api/tickets/tkt-1',
        respond: () =>
          jsonResponse({ error: { code: 'STALE_UPDATE', message: 'This ticket was updated elsewhere.' } }, 409),
      },
    ]);

    const { qc, move } = renderMoveHarness();
    await qc.refetchQueries({ queryKey: queryKeys.board('proj-1') });
    expect(ticketLocation(qc, 'tkt-1')).toBe('IN_PROGRESS');

    await expect(move({ ticketId: 'tkt-1', version: 1, status: 'TESTED' })).rejects.toBeTruthy();
    // Rollback restores, then onSettled refetches — final state equals server truth.
    await waitFor(() => {
      const data = qc.getQueryData<{ board: ReturnType<typeof mockBoard>['board'] }>(queryKeys.board('proj-1'));
      const t = data?.board.columns.flatMap((c) => c.tickets).find((x) => x.id === 'tkt-1');
      expect(t?.version).toBe(7);
      expect(t?.title).toBe('Edited elsewhere');
    });
  });
});
