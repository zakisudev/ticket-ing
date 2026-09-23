import { expect, test, type Locator, type Page } from '@playwright/test';

const statuses = ['PLANNED', 'IN_PROGRESS', 'IMPLEMENTED', 'TESTED', 'DEPLOYED'] as const;

function ticket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    projectId: 'project-1',
    projectKey: 'ZKT',
    displayId: 'ZKT-001',
    ticketNumber: 1,
    version: 1,
    title: 'Zakisu Tickets V1 Foundation',
    status: 'PLANNED',
    priority: 'P1',
    type: 'FEATURE',
    isBlocked: false,
    blockedReason: null,
    limitations: null,
    archivedAt: null,
    ...overrides,
  };
}

async function dragWithPointer(page: Page, source: Locator, target: Locator): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Drag source or target is not visible');

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + sourceBox.height / 2;
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 12, sourceY + 12, { steps: 3 });
  await expect(page.getByTestId('drag-overlay')).toBeVisible();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();
}

test('pointer drag moves a ticket into populated and empty lifecycle columns', async ({ page }) => {
  let moved = ticket();
  const stationary = ticket({
    id: 'ticket-2',
    displayId: 'ZKT-002',
    ticketNumber: 2,
    title: 'Existing in-progress ticket',
    status: 'IN_PROGRESS',
  });
  const patchStatuses: string[] = [];
  const consoleErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      return route.continue();
    }
    const respond = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (request.method() === 'GET' && url.pathname === '/api/auth/me') {
      return respond({
        user: {
          id: 'owner-1',
          email: 'owner@zakisu.test',
          name: 'Owner',
          createdAt: '2026-09-23T00:00:00.000Z',
        },
      });
    }
    if (request.method() === 'GET' && url.pathname === '/api/projects') {
      return respond({
        projects: [
          {
            id: 'project-1',
            name: 'Zakisu Tickets',
            slug: 'zakisu-tickets',
            projectKey: 'ZKT',
            description: null,
            color: null,
            icon: null,
            repositoryUrl: null,
            stagingUrl: null,
            productionUrl: 'https://tickets.zakisu.com',
            ticketCount: 2,
            archived: false,
            archivedAt: null,
            createdAt: '2026-09-23T00:00:00.000Z',
            updatedAt: '2026-09-23T00:00:00.000Z',
          },
        ],
      });
    }
    if (request.method() === 'GET' && url.pathname === '/api/projects/project-1/tickets/board') {
      return respond({
        board: {
          projectId: 'project-1',
          projectKey: 'ZKT',
          columns: statuses.map((status) => ({
            status,
            tickets: [moved, stationary].filter((item) => item.status === status),
          })),
        },
      });
    }
    if (request.method() === 'PATCH' && url.pathname === '/api/tickets/ticket-1') {
      const body = request.postDataJSON() as { status: string };
      patchStatuses.push(body.status);
      moved = { ...moved, status: body.status, version: Number(moved.version) + 1 };
      return respond({ ticket: moved });
    }
    return respond({ error: { code: 'NOT_FOUND', message: 'Unmocked test route' } }, 404);
  });

  await page.goto('/p/zakisu-tickets/board');
  await expect(page.getByTestId('ticket-card-ZKT-001')).toBeVisible();

  await dragWithPointer(
    page,
    page.getByTestId('ticket-card-ZKT-001'),
    page.getByTestId('board-column-IN_PROGRESS'),
  );
  await expect(
    page.getByTestId('board-column-IN_PROGRESS').getByTestId('ticket-card-ZKT-001'),
  ).toBeVisible();

  await dragWithPointer(
    page,
    page.getByTestId('ticket-card-ZKT-001'),
    page.getByTestId('board-column-IMPLEMENTED'),
  );
  await expect(
    page.getByTestId('board-column-IMPLEMENTED').getByTestId('ticket-card-ZKT-001'),
  ).toBeVisible();

  expect(patchStatuses).toEqual(['IN_PROGRESS', 'IMPLEMENTED']);
  await expect(page).toHaveURL(/\/p\/zakisu-tickets\/board$/);
  expect(consoleErrors).toEqual([]);
});
