import { vi } from 'vitest';
import type {
  BoardDto,
  ChecklistItemDto,
  ProjectDto,
  TagDto,
  TicketDetailDto,
  TicketDto,
  TicketLinkDto,
  TicketRelationDto,
  UserDto,
} from '@zakisu-tickets/shared';

export function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    headers: new Headers(),
  } as unknown as Response;
}

export function mockUser(overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: 'user-1',
    email: 'owner@zakisu.test',
    name: 'Owner',
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

export function mockProject(overrides: Partial<ProjectDto> = {}): ProjectDto {
  return {
    id: 'proj-1',
    name: 'TemariOne',
    slug: 'temarione',
    projectKey: 'TMR',
    description: 'School management SaaS',
    color: null,
    icon: null,
    repositoryUrl: null,
    stagingUrl: null,
    productionUrl: 'https://app.temarione.com',
    ticketCount: 2,
    archived: false,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

export function mockTicket(overrides: Partial<TicketDto> = {}): TicketDto {
  return {
    id: 'tkt-1',
    projectId: 'proj-1',
    projectKey: 'TMR',
    displayId: 'TMR-001',
    ticketNumber: 1,
    version: 1,
    title: 'First ticket',
    status: 'PLANNED',
    priority: 'P2',
    type: 'FEATURE',
    isBlocked: false,
    blockedReason: null,
    summary: null,
    description: null,
    motivation: null,
    acceptanceCriteria: null,
    implementationNotes: null,
    testingNotes: null,
    deploymentNotes: null,
    limitations: null,
    knownIssues: null,
    followUpNotes: null,
    sourceReference: null,
    archivedAt: null,
    startedAt: null,
    implementedAt: null,
    testedAt: null,
    deployedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

export function mockBoard(tickets: TicketDto[]): { board: BoardDto } {
  const statuses = ['PLANNED', 'IN_PROGRESS', 'IMPLEMENTED', 'TESTED', 'DEPLOYED'] as const;
  return {
    board: {
      projectId: 'proj-1',
      projectKey: 'TMR',
      columns: statuses.map((status) => ({
        status,
        tickets: tickets.filter((t) => t.status === status),
      })),
    },
  };
}

export function mockDetail(ticket: TicketDto): { ticket: TicketDetailDto } {
  return {
    ticket: {
      ...ticket,
      activity: [
        {
          id: 'act-1',
          ticketId: ticket.id,
          type: 'TICKET_CREATED',
          metadata: { status: ticket.status, priority: ticket.priority, type: ticket.type },
          createdAt: ticket.createdAt,
          seq: 1,
        },
      ],
      checklist: [] as ChecklistItemDto[],
      links: [] as TicketLinkDto[],
      relations: [] as TicketRelationDto[],
      tags: [] as TagDto[],
    },
  };
}

/** Installs a fetch mock routing by (method, url-prefix). */
export function installFetchRouter(
  routes: Array<{ method: string; prefix: string; respond: (url: string, body: unknown) => Response }>
): { fetchMock: ReturnType<typeof vi.fn>; getCalls: () => Array<{ method: string; url: string; body: unknown }> } {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const route = routes.find((r) => r.method === method && url.startsWith(r.prefix));
    if (!route) return jsonResponse({ error: { code: 'NOT_FOUND', message: `unmocked: ${method} ${url}` } }, 404);
    return route.respond(url, body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, getCalls: () => calls };
}
