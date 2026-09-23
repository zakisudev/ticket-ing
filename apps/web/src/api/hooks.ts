import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type {
  BoardDto,
  ChecklistItemDto,
  ProjectDto,
  TagDto,
  TicketDetailDto,
  TicketDto,
  TicketFilterParams,
  TicketLinkDto,
  TicketListDto,
  TicketRelationDto,
  UserDto,
} from '@zakisu-tickets/shared';
import { api } from './client';

export const queryKeys = {
  me: ['me'] as const,
  registrationStatus: ['registration-status'] as const,
  projects: (includeArchived: boolean) => ['projects', { includeArchived }] as const,
  project: (id: string) => ['project', id] as const,
  board: (projectId: string) => ['board', projectId] as const,
  ticket: (id: string) => ['ticket', id] as const,
  list: (projectId: string, filters: string) => ['list', projectId, filters] as const,
  projectTags: (projectId: string) => ['tags', projectId] as const,
};

// --- auth ---

export function useRegistrationStatus() {
  return useQuery({
    queryKey: queryKeys.registrationStatus,
    queryFn: () => api.get<{ open: boolean }>('/api/auth/registration-status'),
    staleTime: 30_000,
  });
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.get<{ user: UserDto | null }>('/api/auth/me'),
    retry: false,
  });
}

export function useLogin(): UseMutationResult<{ user: UserDto }, Error, { email: string; password: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => api.post('/api/auth/login', input),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.me, { user: data.user });
      void qc.invalidateQueries();
    },
  });
}

export function useRegister(): UseMutationResult<
  { user: UserDto },
  Error,
  { email: string; password: string; name?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => api.post('/api/auth/register', input),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.me, { user: data.user });
      void qc.invalidateQueries();
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: () => {
      qc.setQueryData(queryKeys.me, { user: null });
      qc.clear();
    },
  });
}

// --- projects ---

export function useProjects(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.projects(includeArchived),
    queryFn: () => api.get<{ projects: ProjectDto[] }>('/api/projects'),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => api.post<{ project: ProjectDto }>('/api/projects', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: unknown) => api.patch<{ project: ProjectDto }>(`/api/projects/${projectId}`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, archived }: { projectId: string; archived: boolean }) =>
      api.post<{ project: ProjectDto }>(`/api/projects/${projectId}/${archived ? 'unarchive' : 'archive'}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// --- board + tickets ---

export function useBoard(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.board(projectId ?? 'none'),
    queryFn: () => api.get<{ board: BoardDto }>(`/api/projects/${projectId}/tickets/board`),
    enabled: projectId !== undefined,
  });
}

/** Stable cache key fragment for the current filter set. */
export function filterKey(filters: TicketFilterParams): string {
  const entries = Object.entries(filters).filter(([, v]) => v !== undefined && v !== '');
  return entries.length === 0 ? 'all' : JSON.stringify(Object.fromEntries(entries));
}

export function useTicketList(
  projectId: string | undefined,
  filters: TicketFilterParams & { sortBy?: string; sortDir?: string }
) {
  const key = filterKey(filters);
  return useQuery({
    queryKey: queryKeys.list(projectId ?? 'none', key),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== '') params.set(k, String(v));
      }
      return api.get<TicketListDto>(`/api/projects/${projectId}/tickets?${params.toString()}`);
    },
    enabled: projectId !== undefined,
  });
}

export function useTicket(ticketId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ticket(ticketId ?? 'none'),
    queryFn: () => api.get<{ ticket: TicketDetailDto }>(`/api/tickets/${ticketId}`),
    enabled: ticketId !== undefined,
  });
}

export function useCreateTicket(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; status?: string; priority?: string; type?: string }) =>
      api.post<{ ticket: TicketDto }>(`/api/projects/${projectId}/tickets`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.board(projectId) });
      void qc.invalidateQueries({ queryKey: ['list'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export interface TicketPatch {
  version: number;
  title?: string;
  summary?: string | null;
  description?: string | null;
  motivation?: string | null;
  acceptanceCriteria?: string | null;
  implementationNotes?: string | null;
  testingNotes?: string | null;
  deploymentNotes?: string | null;
  limitations?: string | null;
  knownIssues?: string | null;
  followUpNotes?: string | null;
  sourceReference?: string | null;
  status?: string;
  priority?: string;
  type?: string;
  isBlocked?: boolean;
  blockedReason?: string | null;
  archived?: boolean;
}

/**
 * Optimistic status move: patch board cache immediately, roll back on failure.
 * Returns the previous board snapshot via onError context for exact restoration.
 */
export function useMoveTicket(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, version, status }: { ticketId: string; version: number; status: string }) =>
      api.patch<{ ticket: TicketDto }>(`/api/tickets/${ticketId}`, { version, status }),
    onMutate: async ({ ticketId, status }) => {
      const key = queryKeys.board(projectId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ board: BoardDto }>(key);
      if (previous) {
        qc.setQueryData<{ board: BoardDto }>(key, {
          ...previous,
          board: {
            ...previous.board,
            columns: previous.board.columns.map((col) => ({
              ...col,
              tickets: col.tickets.filter((t) => t.id !== ticketId),
            })),
          },
        });
        const moved = previous.board.columns
          .flatMap((c) => c.tickets)
          .find((t) => t.id === ticketId);
        if (moved) {
          qc.setQueryData<{ board: BoardDto }>(key, {
            ...previous,
            board: {
              ...previous.board,
              columns: previous.board.columns.map((col) =>
                col.status === status
                  ? { ...col, tickets: [{ ...moved, status }, ...col.tickets] }
                  : col
              ),
            },
          });
        }
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.board(projectId), context.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.board(projectId) });
      void qc.invalidateQueries({ queryKey: ['list'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function usePatchTicket(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: TicketPatch) => api.patch<{ ticket: TicketDto }>(`/api/tickets/${ticketId}`, patch),
    onSuccess: (data) => {
      qc.setQueryData<{ ticket: TicketDetailDto }>(queryKeys.ticket(ticketId), (current) =>
        current ? { ticket: { ...current.ticket, ...data.ticket, activity: current.ticket.activity } } : current
      );
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: ['list'] });
    },
  });
}

export function useArchiveTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, archived }: { ticketId: string; archived: boolean }) =>
      api.post<{ ticket: TicketDto }>(`/api/tickets/${ticketId}/${archived ? 'restore' : 'archive'}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: ['ticket'] });
      void qc.invalidateQueries({ queryKey: ['list'] });
    },
  });
}

// --- checklist ---

function useSubResourceInvalidation(projectId?: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['ticket'] });
    void qc.invalidateQueries({ queryKey: ['list'] });
    if (projectId) void qc.invalidateQueries({ queryKey: queryKeys.board(projectId) });
  };
}

export function useAddChecklistItem(projectId?: string) {
  const invalidate = useSubResourceInvalidation(projectId);
  return useMutation({
    mutationFn: ({ ticketId, text }: { ticketId: string; text: string }) =>
      api.post<{ item: ChecklistItemDto }>(`/api/tickets/${ticketId}/checklist`, { text }),
    onSuccess: invalidate,
  });
}

export function useUpdateChecklistItem(projectId?: string) {
  const invalidate = useSubResourceInvalidation(projectId);
  return useMutation({
    mutationFn: ({
      ticketId,
      itemId,
      patch,
    }: {
      ticketId: string;
      itemId: string;
      patch: { text?: string; completed?: boolean };
    }) => api.patch<{ item: ChecklistItemDto }>(`/api/tickets/${ticketId}/checklist/${itemId}`, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteChecklistItem(projectId?: string) {
  const invalidate = useSubResourceInvalidation(projectId);
  return useMutation({
    mutationFn: ({ ticketId, itemId }: { ticketId: string; itemId: string }) =>
      api.delete<void>(`/api/tickets/${ticketId}/checklist/${itemId}`),
    onSuccess: invalidate,
  });
}

export function useReorderChecklistItem(projectId?: string) {
  const invalidate = useSubResourceInvalidation(projectId);
  return useMutation({
    mutationFn: ({
      ticketId,
      itemId,
      direction,
    }: {
      ticketId: string;
      itemId: string;
      direction: 'up' | 'down';
    }) =>
      api.post<{ items: ChecklistItemDto[] }>(`/api/tickets/${ticketId}/checklist/${itemId}/reorder`, {
        direction,
      }),
    onSuccess: invalidate,
  });
}

// --- links ---

export function useAddLink(projectId?: string) {
  const invalidate = useSubResourceInvalidation(projectId);
  return useMutation({
    mutationFn: ({
      ticketId,
      input,
    }: {
      ticketId: string;
      input: { type: string; label?: string | null; url: string };
    }) => api.post<{ link: TicketLinkDto }>(`/api/tickets/${ticketId}/links`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteLink(projectId?: string) {
  const invalidate = useSubResourceInvalidation(projectId);
  return useMutation({
    mutationFn: ({ ticketId, linkId }: { ticketId: string; linkId: string }) =>
      api.delete<void>(`/api/tickets/${ticketId}/links/${linkId}`),
    onSuccess: invalidate,
  });
}

// --- relations ---

export function useAddRelation(projectId?: string) {
  const invalidate = useSubResourceInvalidation(projectId);
  return useMutation({
    mutationFn: ({ ticketId, input }: { ticketId: string; input: { type: string; otherTicketId: string } }) =>
      api.post<{ relations: TicketRelationDto[] }>(`/api/tickets/${ticketId}/relations`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteRelation(projectId?: string) {
  const invalidate = useSubResourceInvalidation(projectId);
  return useMutation({
    mutationFn: ({ ticketId, relationId }: { ticketId: string; relationId: string }) =>
      api.delete<void>(`/api/tickets/${ticketId}/relations/${relationId}`),
    onSuccess: invalidate,
  });
}

// --- tags ---

export function useProjectTags(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projectTags(projectId ?? 'none'),
    queryFn: () => api.get<{ tags: TagDto[] }>(`/api/projects/${projectId}/tags`),
    enabled: projectId !== undefined,
  });
}

export function useCreateTag(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color?: string | null }) =>
      api.post<{ tag: TagDto }>(`/api/projects/${projectId}/tags`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.projectTags(projectId) });
      void qc.invalidateQueries({ queryKey: ['ticket'] });
    },
  });
}

export function useAttachTag(projectId?: string) {
  const invalidate = useSubResourceInvalidation(projectId);
  return useMutation({
    mutationFn: ({ ticketId, tagId }: { ticketId: string; tagId: string }) =>
      api.post<{ tags: TagDto[] }>(`/api/tickets/${ticketId}/tags`, { tagId }),
    onSuccess: invalidate,
  });
}

export function useDetachTag(projectId?: string) {
  const invalidate = useSubResourceInvalidation(projectId);
  return useMutation({
    mutationFn: ({ ticketId, tagId }: { ticketId: string; tagId: string }) =>
      api.delete<{ tags: TagDto[] }>(`/api/tickets/${ticketId}/tags/${tagId}`),
    onSuccess: invalidate,
  });
}
