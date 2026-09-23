import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type {
  BoardDto,
  ProjectDto,
  TicketDetailDto,
  TicketDto,
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
  blockedReason?: string | null;
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
    },
  });
}
