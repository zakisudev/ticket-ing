import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { AuthProvider } from '@/features/auth/AuthContext';
import { TicketDetailPage } from '@/features/tickets/TicketDetailPage';
import { Markdown, shortCommitHash } from '@/components/Markdown';
import {
  installFetchRouter,
  jsonResponse,
  mockDetail,
  mockProject,
  mockTicket,
  mockUser,
} from './mocks';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDetail(
  ticketResponse: object,
  extraRoutes: Parameters<typeof installFetchRouter>[0] = [],
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = installFetchRouter([
    { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: mockUser() }) },
    {
      method: 'GET',
      prefix: '/api/projects',
      respond: () => jsonResponse({ projects: [mockProject()] }),
    },
    { method: 'GET', prefix: '/api/tickets/tkt-1', respond: () => jsonResponse(ticketResponse) },
    ...extraRoutes,
  ]);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/p/temarione/tickets/tkt-1']}>
        <AuthProvider>
          <Routes>
            <Route path="/p/:slug/tickets/:ticketId" element={<TicketDetailPage />} />
            <Route path="/p/:slug/board" element={<div>Board</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { router };
}

// ---------------------------------------------------------------------------
// Markdown sanitization
// ---------------------------------------------------------------------------
describe('Markdown rendering security', () => {
  it('strips script tags and event handlers', () => {
    const { container } = render(
      <Markdown
        text={[
          'hello <script>alert(1)</script> world',
          '<img src=x onerror="alert(1)">',
          '[click](javascript:alert(1))',
        ].join('\n')}
      />,
    );
    // No executable script element; raw text may survive as inert text.
    expect(container.querySelector('script')).toBeNull();
    const img = container.querySelector('img');
    if (img) expect(img.getAttribute('onerror')).toBeNull();
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.every((a) => !a.getAttribute('href')?.startsWith('javascript:'))).toBe(true);
    expect(container.innerHTML).not.toContain('<script');
  });

  it('renders GFM tables, task lists, and http(s) links safely', () => {
    render(
      <Markdown
        text={[
          '| col |',
          '| --- |',
          '| a |',
          '',
          '- [x] done',
          '- [ ] todo',
          '',
          '[site](https://example.com)',
        ].join('\n')}
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { checked: true })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'site' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });
});

// ---------------------------------------------------------------------------
// Commit hash shortening
// ---------------------------------------------------------------------------
describe('shortCommitHash', () => {
  it('shortens full 40-char hashes to 7 chars and keeps labels intact', () => {
    expect(shortCommitHash('bf4e0ae6a728674f507011635d58b9bb2346cdc2')).toBe('bf4e0ae');
    expect(shortCommitHash('b09101a')).toBeNull(); // too short to be a "full" hash
    expect(shortCommitHash('Mobile overflow fix')).toBeNull();
    expect(shortCommitHash(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Detail page
// ---------------------------------------------------------------------------
describe('TicketDetailPage Phase 2', () => {
  it('requires confirmation before archiving a ticket', async () => {
    const user = userEvent.setup();
    const { router } = renderDetail(mockDetail(mockTicket({ id: 'tkt-1' })), [
      {
        method: 'POST',
        prefix: '/api/tickets/tkt-1/archive',
        respond: () =>
          jsonResponse({
            ticket: mockTicket({ id: 'tkt-1', archivedAt: '2026-09-03T00:00:00.000Z' }),
          }),
      },
    ]);

    await user.click(await screen.findByTestId('ticket-archive'));
    let dialog = screen.getByRole('alertdialog', { name: 'Archive ticket?' });
    expect(dialog).toHaveTextContent('TMR-001: First ticket');
    expect(router.getCalls().some((call) => call.method === 'POST')).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog', { name: 'Archive ticket?' })).not.toBeInTheDocument();
    expect(router.getCalls().some((call) => call.method === 'POST')).toBe(false);

    await user.click(screen.getByTestId('ticket-archive'));
    dialog = screen.getByRole('alertdialog', { name: 'Archive ticket?' });
    await user.click(within(dialog).getByRole('button', { name: 'Archive ticket' }));

    await waitFor(() => {
      expect(router.getCalls()).toContainEqual({
        method: 'POST',
        url: '/api/tickets/tkt-1/archive',
        body: undefined,
      });
    });
  });

  it('restores an archived ticket through the restore endpoint', async () => {
    const user = userEvent.setup();
    const archivedTicket = mockTicket({ id: 'tkt-1', archivedAt: '2026-09-03T00:00:00.000Z' });
    const { router } = renderDetail(mockDetail(archivedTicket), [
      {
        method: 'POST',
        prefix: '/api/tickets/tkt-1/restore',
        respond: () => jsonResponse({ ticket: mockTicket({ id: 'tkt-1', archivedAt: null }) }),
      },
    ]);

    await user.click(await screen.findByTestId('ticket-restore'));

    await waitFor(() => {
      expect(router.getCalls()).toContainEqual({
        method: 'POST',
        url: '/api/tickets/tkt-1/restore',
        body: undefined,
      });
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renders blocked state with badge and unblock control', async () => {
    renderDetail(
      mockDetail(
        mockTicket({
          id: 'tkt-1',
          status: 'IMPLEMENTED',
          isBlocked: true,
          blockedReason: 'Waiting for production mailbox test',
        }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId('ticket-title-input')).toBeInTheDocument());
    expect(screen.getByTestId('blocked-badge')).toBeInTheDocument();
    expect(screen.getByTestId('blocked-reason-box')).toHaveTextContent(
      'Waiting for production mailbox test',
    );
    expect(screen.getByTestId('ticket-unblock')).toBeInTheDocument();
    // Lifecycle status unchanged in header.
    expect(screen.getByTestId('ticket-status')).toHaveValue('IMPLEMENTED');
  });

  it('shows LIMITATIONS indicator for limitations-bearing tickets', async () => {
    renderDetail(
      mockDetail(
        mockTicket({
          id: 'tkt-1',
          status: 'DEPLOYED',
          limitations: 'mailbox rendering unverified',
        }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId('limitations-badge')).toBeInTheDocument());
  });

  it('shows the deployment-notes prompt for DEPLOYED tickets without notes', async () => {
    renderDetail(
      mockDetail(mockTicket({ id: 'tkt-1', status: 'DEPLOYED', deploymentNotes: null })),
    );
    await waitFor(() => expect(screen.getByTestId('deploy-notes-prompt')).toBeInTheDocument());
  });

  it('renders checklist items with completion toggles', async () => {
    renderDetailWithSubResources();
    await waitFor(() => expect(screen.getByTestId('checklist')).toBeInTheDocument());
    expect(screen.getByText('API implementation')).toBeInTheDocument();
    expect(screen.getByText('deploy production')).toBeInTheDocument();
    expect(screen.getByTestId('checklist-check-0')).toBeChecked();
    expect(screen.getByTestId('checklist-check-1')).not.toBeChecked();
  });

  it('renders COMMIT links with shortened hashes in the links panel', async () => {
    renderDetailWithSubResources();
    await waitFor(() => expect(screen.getByTestId('links')).toBeInTheDocument());
    const commit = screen.getByTestId('commit-link');
    expect(commit).toHaveTextContent('bf4e0ae');
    expect(commit).not.toHaveTextContent('bf4e0ae6a728674f507011635d58b9bb2346cdc2');
    expect(commit).toHaveAttribute(
      'href',
      'https://github.com/zakisu/temarione/commit/bf4e0ae6a728674f507011635d58b9bb2346cdc2',
    );
  });

  it('renders derived BLOCKED_BY relation and tag chips', async () => {
    renderDetailWithSubResources();
    await waitFor(() => expect(screen.getByTestId('relations')).toBeInTheDocument());
    expect(screen.getByTestId('relation-BLOCKED_BY')).toHaveTextContent('TMR-009');
    expect(screen.getByTestId('tag-historical')).toBeInTheDocument();
  });

  it('renders human-readable activity entries including blocking events', async () => {
    renderDetail({
      ticket: {
        ...mockDetail(mockTicket({ id: 'tkt-1' })).ticket,
        activity: [
          {
            id: 'act-3',
            ticketId: 'tkt-1',
            type: 'UNBLOCKED',
            metadata: { previousReason: 'waiting on OPS3B' },
            createdAt: '2026-09-02T00:00:00.000Z',
            seq: 3,
          },
          {
            id: 'act-2',
            ticketId: 'tkt-1',
            type: 'BLOCKED',
            metadata: { reason: 'waiting on OPS3B' },
            createdAt: '2026-09-01T12:00:00.000Z',
            seq: 2,
          },
          {
            id: 'act-1',
            ticketId: 'tkt-1',
            type: 'STATUS_CHANGED',
            metadata: { from: 'PLANNED', to: 'IN_PROGRESS' },
            createdAt: '2026-09-01T00:00:00.000Z',
            seq: 1,
          },
        ],
        checklist: [],
        links: [],
        relations: [],
        tags: [],
      },
    });
    await waitFor(() => expect(screen.getByTestId('ticket-activity')).toBeInTheDocument());
    const activity = screen.getByTestId('ticket-activity');
    expect(activity).toHaveTextContent('Status: PLANNED → IN PROGRESS');
    expect(activity).toHaveTextContent('Blocked — waiting on OPS3B');
    expect(activity).toHaveTextContent('Unblocked (previous reason: waiting on OPS3B)');
  });

  it('requires confirmation before removing ticket content', async () => {
    const user = userEvent.setup();
    const { router } = renderDetailWithSubResources([
      {
        method: 'DELETE',
        prefix: '/api/tickets/tkt-1/checklist/chk-1',
        respond: () => jsonResponse(undefined, 204),
      },
    ]);
    await screen.findByTestId('checklist');

    await user.click(screen.getAllByRole('button', { name: 'Delete item' })[0]);
    let dialog = screen.getByRole('alertdialog', { name: 'Delete checklist item?' });
    expect(dialog).toHaveTextContent('API implementation');
    expect(router.getCalls().some((call) => call.method === 'DELETE')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Remove link' }));
    dialog = screen.getByRole('alertdialog', { name: 'Remove link?' });
    expect(router.getCalls().some((call) => call.method === 'DELETE')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Remove relation' }));
    dialog = screen.getByRole('alertdialog', { name: 'Remove relation?' });
    expect(dialog).toHaveTextContent('TMR-009');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Remove tag historical' }));
    dialog = screen.getByRole('alertdialog', { name: 'Remove tag?' });
    expect(dialog).toHaveTextContent('historical');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getAllByRole('button', { name: 'Delete item' })[0]);
    dialog = screen.getByRole('alertdialog', { name: 'Delete checklist item?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete item' }));
    await waitFor(() => {
      expect(router.getCalls()).toContainEqual({
        method: 'DELETE',
        url: '/api/tickets/tkt-1/checklist/chk-1',
        body: undefined,
      });
    });
  });
});

/**
 * Detail fixture with real sub-resources: checklist, commit link, tag, relation.
 * Renders the page through a dedicated fetch router.
 */
function renderDetailWithSubResources(extraRoutes: Parameters<typeof installFetchRouter>[0] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ticket = {
    ...mockDetail(mockTicket({ id: 'tkt-1' })).ticket,
    checklist: [
      {
        id: 'chk-1',
        ticketId: 'tkt-1',
        text: 'API implementation',
        completed: true,
        sortOrder: 0,
        createdAt: '2026-09-01T00:00:00.000Z',
        completedAt: '2026-09-01T01:00:00.000Z',
      },
      {
        id: 'chk-2',
        ticketId: 'tkt-1',
        text: 'deploy production',
        completed: false,
        sortOrder: 1,
        createdAt: '2026-09-01T00:00:00.000Z',
        completedAt: null,
      },
    ],
    links: [
      {
        id: 'lnk-1',
        ticketId: 'tkt-1',
        type: 'COMMIT',
        label: 'bf4e0ae6a728674f507011635d58b9bb2346cdc2',
        url: 'https://github.com/zakisu/temarione/commit/bf4e0ae6a728674f507011635d58b9bb2346cdc2',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    relations: [
      {
        id: 'rel-1',
        ticketId: 'tkt-1',
        type: 'BLOCKED_BY',
        otherTicketId: 'tkt-9',
        otherDisplayId: 'TMR-009',
        otherTitle: 'Schema reconciliation',
        otherStatus: 'PLANNED',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    tags: [
      { id: 'tag-1', projectId: 'proj-1', name: 'historical', slug: 'historical', color: null },
    ],
  };
  const router = installFetchRouter([
    { method: 'GET', prefix: '/api/auth/me', respond: () => jsonResponse({ user: mockUser() }) },
    {
      method: 'GET',
      prefix: '/api/projects/proj-1/tags',
      respond: () => jsonResponse({ tags: [] }),
    },
    {
      method: 'GET',
      prefix: '/api/projects',
      respond: () => jsonResponse({ projects: [mockProject()] }),
    },
    { method: 'GET', prefix: '/api/tickets/tkt-1', respond: () => jsonResponse({ ticket }) },
    ...extraRoutes,
  ]);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/p/temarione/tickets/tkt-1']}>
        <AuthProvider>
          <Routes>
            <Route path="/p/:slug/tickets/:ticketId" element={<TicketDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { router };
}
