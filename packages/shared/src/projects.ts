import { z } from 'zod';

/** Short, uppercase, stable project key used for display IDs (e.g. TMR-001). */
export const projectKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(10)
  .regex(/^[A-Z][A-Z0-9]*$/, 'Use 2-10 uppercase letters/digits starting with a letter');

/** Optional URL field: empty string normalizes to null; must be http(s). */
export const optionalUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === '' || /^https?:\/\//i.test(v), 'Must be an http(s) URL')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  projectKey: projectKeySchema,
  description: z.string().trim().max(2000).nullable().optional(),
  color: z.string().trim().max(32).nullable().optional(),
  icon: z.string().trim().max(32).nullable().optional(),
  repositoryUrl: optionalUrlSchema,
  stagingUrl: optionalUrlSchema,
  productionUrl: optionalUrlSchema,
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export interface ProjectDto {
  id: string;
  name: string;
  slug: string;
  projectKey: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  repositoryUrl: string | null;
  stagingUrl: string | null;
  productionUrl: string | null;
  ticketCount: number;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** TMR-042 style display ID; derived from the current project key, never stored. */
export function displayTicketId(projectKey: string, ticketNumber: number): string {
  return `${projectKey}-${String(ticketNumber).padStart(3, '0')}`;
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug.length > 0 ? slug : 'project';
}

/**
 * Tag slug: lowercase, hyphen/underscore separated, unique per project.
 * Used for URL filter params (`?tag=historical`) and Phase 4 import matching.
 */
export function tagSlugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug.length > 0 ? slug : 'tag';
}
