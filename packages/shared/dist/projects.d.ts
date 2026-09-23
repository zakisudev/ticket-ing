import { z } from 'zod';
/** Short, uppercase, stable project key used for display IDs (e.g. TMR-001). */
export declare const projectKeySchema: z.ZodString;
/** Optional URL field: empty string normalizes to null; must be http(s). */
export declare const optionalUrlSchema: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<string | null, string>>>>;
export declare const createProjectSchema: z.ZodObject<{
    name: z.ZodString;
    projectKey: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    icon: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    repositoryUrl: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<string | null, string>>>>;
    stagingUrl: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<string | null, string>>>>;
    productionUrl: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<string | null, string>>>>;
}, z.core.$strip>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export declare const updateProjectSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    projectKey: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    color: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    icon: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    repositoryUrl: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<string | null, string>>>>>;
    stagingUrl: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<string | null, string>>>>>;
    productionUrl: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<string | null, string>>>>>;
}, z.core.$strip>;
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
export declare function displayTicketId(projectKey: string, ticketNumber: number): string;
export declare function slugify(input: string): string;
/**
 * Tag slug: lowercase, hyphen/underscore separated, unique per project.
 * Used for URL filter params (`?tag=historical`) and Phase 4 import matching.
 */
export declare function tagSlugify(input: string): string;
//# sourceMappingURL=projects.d.ts.map