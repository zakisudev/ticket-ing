import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { installFetchRouter, jsonResponse, mockProject } from './mocks';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProjectsPage destructive actions', () => {
  it('requires confirmation before archiving a project', async () => {
    const user = userEvent.setup();
    const project = mockProject();
    const router = installFetchRouter([
      {
        method: 'GET',
        prefix: '/api/projects',
        respond: () => jsonResponse({ projects: [project] }),
      },
      {
        method: 'POST',
        prefix: '/api/projects/proj-1/archive',
        respond: () =>
          jsonResponse({
            project: { ...project, archived: true, archivedAt: '2026-09-03T00:00:00.000Z' },
          }),
      },
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProjectsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const archiveButton = await screen.findByRole('button', { name: 'Archive TemariOne' });
    await user.click(archiveButton);
    let dialog = screen.getByRole('alertdialog', { name: 'Archive project?' });
    expect(dialog).toHaveTextContent('TemariOne');
    expect(router.getCalls().some((call) => call.method === 'POST')).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog', { name: 'Archive project?' })).not.toBeInTheDocument();
    expect(router.getCalls().some((call) => call.method === 'POST')).toBe(false);

    await user.click(archiveButton);
    dialog = screen.getByRole('alertdialog', { name: 'Archive project?' });
    await user.click(within(dialog).getByRole('button', { name: 'Archive project' }));

    await waitFor(() => {
      expect(router.getCalls()).toContainEqual({
        method: 'POST',
        url: '/api/projects/proj-1/archive',
        body: undefined,
      });
    });
  });
});
