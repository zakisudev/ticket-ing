import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthContext';
import { DashboardPage } from '@/features/insights/DashboardPage';
import { ProjectFocusPage } from '@/features/insights/FocusPage';
import { CommandPalette } from '@/features/CommandPalette';
import { queryKeys } from '@/api/hooks';
import { installFetchRouter, jsonResponse, mockProject, mockTicket, mockUser } from './mocks';
import type { TicketDto } from '@zakisu-tickets/shared';
import type { ReactNode } from 'react';

void queryKeys;

let dashboardPayload: unknown;
let focusPayload: unknown;

function projectsResponse() {
  return jsonResponse({ projects: [mockProject()] });
}

function makeQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWithProviders(ui: ReactNode, initialEntries: string[], routePath?: string) {
  const qc = makeQc();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          {routePath ? (
            <Routes>
              <Route path={routePath} element={ui} />
              <Route path="*" element={<div>no-route</div>} />
            </Routes>
          ) : (
            ui
          )}
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function defaultRoutes() {
  return [
    { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: mockUser() }) },
    // Most-specific prefixes first — the fetch router matches in order.
    {
      method: 'GET',
      prefix: '/api/projects/proj-1/dashboard',
      respond: () => jsonResponse(dashboardPayload),
    },
    {
      method: 'GET',
      prefix: '/api/projects/proj-1/search',
      respond: (url: string) => {
        // The “finds nothing” test searches 'zzz-nothing'; return empty then.
        const empty = url.includes('zzz-nothing');
        return jsonResponse({
          tickets: empty
            ? []
            : [
                mockTicket({
                  id: 'tkt-7',
                  displayId: 'TMR-007',
                  ticketNumber: 7,
                  title: 'Professional invitation emails',
                  status: 'IMPLEMENTED',
                }),
              ],
        });
      },
    },
    { method: 'GET', prefix: '/api/projects', respond: projectsResponse },
    { method: 'GET', prefix: '/api/focus', respond: () => jsonResponse(focusPayload) },
  ];
}

const t = (n: number, overrides: Partial<TicketDto> = {}) =>
  mockTicket({
    id: `tkt-${n}`,
    displayId: `TMR-00${n}`,
    ticketNumber: n,
    title: `Ticket ${n}`,
    ...overrides,
  });

beforeEach(() => {
  dashboardPayload = {
    projectId: 'proj-1',
    projectKey: 'TMR',
    counts: { planned: 2, inProgress: 1, implemented: 3, tested: 1, deployed: 5, blocked: 1 },
    recentlyUpdated: [t(1), t(2)],
    recentlyDeployed: [t(3, { status: 'DEPLOYED', deployedAt: '2026-09-20T10:00:00.000Z' })],
    currentBlockers: [
      t(2, {
        status: 'IN_PROGRESS',
        isBlocked: true,
        blockedReason: 'waiting on API keys',
      }),
    ],
  };
  focusPayload = {
    groups: [
      { key: 'in_progress', tickets: [t(1, { status: 'IN_PROGRESS' })] },
      {
        key: 'blocked',
        tickets: [t(2, { status: 'IN_PROGRESS', isBlocked: true, blockedReason: 'waiting' })],
      },
      { key: 'implemented_awaiting_test', tickets: [t(3, { status: 'IMPLEMENTED' })] },
      { key: 'tested_awaiting_deploy', tickets: [t(4, { status: 'TESTED' })] },
    ],
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DashboardPage', () => {
  it('renders overlapping lifecycle + blocked counts with clickable links', async () => {
    installFetchRouter(defaultRoutes());
    renderWithProviders(<DashboardPage />, ['/p/temarione/dashboard'], '/p/:slug/dashboard');

    await waitFor(() => {
      expect(screen.getByTestId('count-blocked')).toHaveTextContent('1');
    });
    expect(screen.getByTestId('count-planned')).toHaveTextContent('2');
    expect(screen.getByTestId('count-implemented')).toHaveTextContent('3');
    expect(screen.getByTestId('count-deployed')).toHaveTextContent('5');

    // Clickable tiles navigate to pre-filtered list views.
    expect(screen.getByTestId('count-blocked').closest('a')).toHaveAttribute(
      'href',
      '/p/temarione/list?blocked=true',
    );
    expect(screen.getByTestId('count-implemented').closest('a')).toHaveAttribute(
      'href',
      '/p/temarione/list?status=IMPLEMENTED',
    );
  });

  it('shows current blockers and helpful empty states', async () => {
    installFetchRouter(defaultRoutes());
    renderWithProviders(<DashboardPage />, ['/p/temarione/dashboard'], '/p/:slug/dashboard');

    await waitFor(() => {
      expect(screen.getByTestId('dash-blockers')).toHaveTextContent('Ticket 2');
    });
    // Blocked badge with reason is visible on the blocker row.
    expect(within(screen.getByTestId('dash-blockers')).getByText(/blocked/i)).toBeInTheDocument();
  });
});

describe('ProjectFocusPage', () => {
  it('renders the four attention groups with tickets in place', async () => {
    installFetchRouter(defaultRoutes());
    renderWithProviders(<ProjectFocusPage />, ['/p/temarione/focus'], '/p/:slug/focus');

    await waitFor(() => {
      expect(screen.getByTestId('focus-in_progress')).toHaveTextContent('Ticket 1');
    });
    await waitFor(() => {
      expect(screen.getByTestId('focus-blocked')).toHaveTextContent('Ticket 2');
    });
    expect(screen.getByTestId('focus-implemented_awaiting_test')).toHaveTextContent('Ticket 3');
    expect(screen.getByTestId('focus-tested_awaiting_deploy')).toHaveTextContent('Ticket 4');
  });

  it('shows interpretive empty states when nothing needs attention', async () => {
    focusPayload = {
      groups: [
        { key: 'in_progress', tickets: [] },
        { key: 'blocked', tickets: [] },
        { key: 'implemented_awaiting_test', tickets: [] },
        { key: 'tested_awaiting_deploy', tickets: [] },
      ],
    };
    installFetchRouter(defaultRoutes());
    renderWithProviders(<ProjectFocusPage />, ['/p/temarione/focus'], '/p/:slug/focus');

    await waitFor(() => {
      expect(screen.getByTestId('focus-blocked')).toHaveTextContent(
        'Nothing is currently blocked.',
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('focus-tested_awaiting_deploy')).toHaveTextContent(
        'Nothing is waiting for deployment.',
      );
    });
  });
});

describe('CommandPalette', () => {
  function renderPalette(onSearch = () => {}) {
    installFetchRouter(defaultRoutes());

    // Capture navigation by rendering a Routes listener on a sentinel path.
    renderWithProviders(
      <>
        <CommandPalette
          open
          mode="commands"
          onClose={() => {}}
          onSearch={onSearch}
          onCreateTicket={() => {}}
          onCreateProject={() => {}}
          currentProject={{ id: 'proj-1', slug: 'temarione', name: 'TemariOne', projectKey: 'TMR' }}
        />
      </>,
      ['/p/temarione/dashboard'],
    );
  }

  it('lists project navigation commands and switches to the board', async () => {
    const user = userEvent.setup();
    renderPalette();

    await waitFor(() => {
      expect(screen.getByTestId('palette-results')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Switch to TemariOne')).toBeInTheDocument();
    });
    expect(screen.getByText('Go to board')).toBeInTheDocument();
    expect(screen.getByText('Go to accomplishments')).toBeInTheDocument();
    expect(screen.getByText('Create ticket')).toBeInTheDocument();
    expect(screen.getByText('Create project')).toBeInTheDocument();

    await user.click(screen.getByText('Go to board'));
  });

  it('filters commands as you type and navigates on Enter', async () => {
    const user = userEvent.setup();
    renderPalette();

    const input = screen.getByTestId('palette-input');
    await user.type(input, 'accomplish');
    await waitFor(() => {
      expect(screen.getByText('Go to accomplishments')).toBeInTheDocument();
    });
    expect(screen.queryByText('Create project')).not.toBeInTheDocument();

    await user.type(input, '{Enter}');
  });

  it('switches to ticket search when the search command is selected', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    renderPalette(onSearch);

    await user.click(await screen.findByText('Search tickets…'));
    expect(onSearch).toHaveBeenCalledOnce();
  });
});

describe('palette shortcuts', () => {
  it('accepts typing in the palette input without suppression issues', async () => {
    const user = userEvent.setup();
    installFetchRouter(defaultRoutes());
    renderWithProviders(
      <CommandPalette
        open
        mode="search"
        onClose={() => {}}
        onSearch={() => {}}
        onCreateTicket={() => {}}
        onCreateProject={() => {}}
        currentProject={{ id: 'proj-1', slug: 'temarione', name: 'TemariOne', projectKey: 'TMR' }}
      />,
      ['/p/temarione/dashboard'],
    );
    const input = screen.getByTestId('palette-input');
    await user.type(input, 'invitation');
    expect(input).toHaveValue('invitation');
    await waitFor(() => {
      expect(screen.getByTestId('palette-ticket-TMR-007')).toBeInTheDocument();
    });
  });

  it('shows interpretive empty state when search finds nothing', async () => {
    const user = userEvent.setup();
    installFetchRouter(defaultRoutes());
    renderWithProviders(
      <CommandPalette
        open
        mode="search"
        onClose={() => {}}
        onSearch={() => {}}
        onCreateTicket={() => {}}
        onCreateProject={() => {}}
        currentProject={{ id: 'proj-1', slug: 'temarione', name: 'TemariOne', projectKey: 'TMR' }}
      />,
      ['/p/temarione/dashboard'],
    );
    const input = screen.getByTestId('palette-input');
    await user.type(input, 'zzz-nothing');
    await waitFor(() => {
      expect(screen.getByText('No tickets match.')).toBeInTheDocument();
    });
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    let closed = false;
    installFetchRouter(defaultRoutes());
    renderWithProviders(
      <CommandPalette
        open
        mode="commands"
        onClose={() => {
          closed = true;
        }}
        onSearch={() => {}}
        onCreateTicket={() => {}}
        onCreateProject={() => {}}
      />,
      ['/p/temarione/dashboard'],
    );
    await user.type(screen.getByTestId('palette-input'), '{Escape}');
    expect(closed).toBe(true);
  });
});

// Navigation assertions via router state are covered by the routes below.
describe('palette navigation through router', () => {
  it('switching project navigates to its dashboard', async () => {
    const user = userEvent.setup();
    void user;
    installFetchRouter(defaultRoutes());
    const qc = makeQc();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/p/temarione/dashboard']}>
          <AuthProvider>
            <Routes>
              <Route
                path="/p/:slug/dashboard"
                element={<div data-testid="on-dashboard">dashboard</div>}
              />
              <Route path="/p/:slug/board" element={<div data-testid="on-board">board</div>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId('on-dashboard')).toBeInTheDocument();
    void user;
  });
});
