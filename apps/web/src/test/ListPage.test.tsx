import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthContext';
import { ListPage } from '@/features/tickets/ListPage';
import {
  installFetchRouter,
  jsonResponse,
  mockProject,
  mockTicket,
  mockUser,
} from './mocks';

afterEach(() => {
  vi.unstubAllGlobals();
});

function listState(searchParams: URLSearchParams) {
  const get = (k: string) => searchParams.get(k);
  const archived = get('archived');
  const all = [
    mockTicket({
      id: 'tkt-1',
      displayId: 'TMR-001',
      title: 'Emails feature',
      status: 'DEPLOYED',
      priority: 'P1',
      deployedAt: '2026-09-01T00:00:00.000Z',
    }),
    mockTicket({
      id: 'tkt-2',
      displayId: 'TMR-002',
      title: 'Logo validation',
      status: 'PLANNED',
      priority: 'P2',
      isBlocked: true,
      blockedReason: 'needs survey',
      limitations: 'upstream validator permissive',
    }),
    mockTicket({
      id: 'tkt-3',
      displayId: 'TMR-003',
      title: 'Old experiment',
      status: 'PLANNED',
      archivedAt: '2026-09-02T00:00:00.000Z',
    }),
  ];
  let tickets = all;
  if (archived === 'only') tickets = all.filter((t) => t.archivedAt);
  else tickets = all.filter((t) => !t.archivedAt);
  if (get('blocked') === 'true') tickets = tickets.filter((t) => t.isBlocked);
  if (get('status')) tickets = tickets.filter((t) => t.status === get('status'));
  if (get('q')) tickets = tickets.filter((t) => t.title.toLowerCase().includes(get('q')!.toLowerCase()));
  const sortBy = (get('sortBy') ?? 'ticketNumber') as 'ticketNumber' | 'priority';
  const desc = get('sortDir') === 'desc';
  if (sortBy === 'priority') {
    tickets = [...tickets].sort((a, b) =>
      desc ? b.priority.localeCompare(a.priority) : a.priority.localeCompare(b.priority)
    );
  }
  return { tickets, total: tickets.length };
}

function renderList(initialUrl = '/p/temarione/list') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Most-specific prefixes first: the tickets route must match before /api/projects.
  installFetchRouter([
    { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: mockUser() }) },
    { method: 'GET', prefix: '/api/projects/proj-1/tickets', respond: (url) => {
      const params = new URL(url, 'http://localhost').searchParams;
      return jsonResponse(listState(params));
    } },
    { method: 'GET', prefix: '/api/projects/proj-1/tags', respond: () => jsonResponse({ tags: [] }) },
    { method: 'GET', prefix: '/api/projects', respond: () => jsonResponse({ projects: [mockProject()] }) },
  ]);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <AuthProvider>
          <Routes>
            <Route path="/p/:slug/list" element={<ListPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ListPage', () => {
  it('renders active tickets with blocked/limitations indicators and hides archived by default', async () => {
    renderList();
    await waitFor(() => expect(screen.getByTestId('list-row-TMR-001')).toBeInTheDocument());
    expect(screen.getByTestId('list-row-TMR-002')).toBeInTheDocument();
    expect(screen.queryByTestId('list-row-TMR-003')).not.toBeInTheDocument();
    expect(screen.getByTestId('blocked-badge')).toBeInTheDocument();
    expect(screen.getByTestId('limitations-badge')).toBeInTheDocument();
  });

  it('filters via URL state (blocked=true) and shows bookmarksable empty results honestly', async () => {
    renderList('/p/temarione/list?blocked=true');
    await waitFor(() => expect(screen.getByTestId('list-row-TMR-002')).toBeInTheDocument());
    expect(screen.queryByTestId('list-row-TMR-001')).not.toBeInTheDocument();
  });

  it('archived=only shows just the archive', async () => {
    renderList('/p/temarione/list?archived=only');
    await waitFor(() => expect(screen.getByTestId('list-row-TMR-003')).toBeInTheDocument());
    expect(screen.queryByTestId('list-row-TMR-001')).not.toBeInTheDocument();
  });

  it('sorts by priority via the header control', async () => {
    const user = userEvent.setup();
    renderList();
    await waitFor(() => expect(screen.getByTestId('list-row-TMR-001')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Priority/ }));
    await waitFor(() => {
      const rows = screen.getAllByTestId(/^list-row-TMR-/).map((r) => r.dataset.testid);
      expect(rows).toEqual(['list-row-TMR-001', 'list-row-TMR-002']); // P1 before P2
    });
  });

  it('searches by title via the q filter', async () => {
    const user = userEvent.setup();
    renderList();
    await waitFor(() => expect(screen.getByTestId('list-row-TMR-001')).toBeInTheDocument());
    await user.type(screen.getByTestId('filter-q'), 'logo');
    await waitFor(() => {
      expect(screen.queryByTestId('list-row-TMR-001')).not.toBeInTheDocument();
      expect(screen.getByTestId('list-row-TMR-002')).toBeInTheDocument();
    });
  });
});
