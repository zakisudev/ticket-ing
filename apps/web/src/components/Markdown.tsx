import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

/**
 * Safe Markdown rendering for long engineering fields.
 *
 * - No raw HTML: rehype-sanitize with a GitHub-style schema strips script/style,
 *   event handlers, and javascript:/data: URLs before anything reaches the DOM.
 * - GFM for tables, task lists, strikethrough.
 * - Links render with rel="noreferrer" via the schema's default target handling.
 */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'details',
    'summary',
  ],
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
  },
};

function MarkdownImpl({ text, testId }: { text: string; testId?: string }) {
  return (
    <div className="prose-zt text-sm leading-relaxed" data-testid={testId}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);

/** Board/list compact commit display: 7 chars for hash-like labels. */
export function shortCommitHash(label: string | null | undefined): string | null {
  if (!label) return null;
  const trimmed = label.trim();
  return /^[0-9a-f]{8,40}$/i.test(trimmed) ? trimmed.slice(0, 7) : null;
}
