# My Journal — Codex Project Instructions

## Project goal
Build a single-owner personal blog and event journal. The owner can create events (for example, "Trip to UK"), write posts within an event or as standalone articles, upload photos, save drafts, and publish selected content publicly. Some content must remain private.

## Technology
- Next.js App Router
- React + TypeScript with strict type checking
- Tailwind CSS
- Supabase PostgreSQL, Auth, and Storage
- Tiptap rich-text editor
- Zod for input validation
- GitHub for source control
- Vercel for hosting

Use current stable, mutually compatible package versions and official documentation. Avoid unnecessary dependencies.

## Product rules
- Single owner for MVP; no public account registration and no multi-user features.
- Posts may optionally belong to an event. `event_id = NULL` means standalone post.
- Events and posts have `private` or `public` visibility.
- Posts also have `draft` or `published` status.
- Public visitors can only read published public posts.
- A post attached to a private event must never be visible publicly, even if the post itself is marked public.
- Draft/private content must not leak through public pages, search, API responses, metadata, image URLs, or error messages.
- When content is unpublished or made private, public access should stop immediately.

## Security requirements
- Enable RLS on every exposed application table and define explicit SELECT/INSERT/UPDATE/DELETE policies.
- Verify the authenticated owner on the server for every mutation. Never trust a client-supplied user ID.
- Do not expose Supabase service-role keys, database passwords, or other secrets to the browser.
- Use environment variables and maintain `.env.example` with placeholders only.
- Use safe rendering for Tiptap JSON; do not render arbitrary HTML without sanitization.
- Restrict upload file types and sizes.
- Protect private images using a private Storage bucket and short-lived signed URLs. Public media must be intentionally separated from private media.
- Add tests for both allowed and denied RLS/access cases.

## Implementation approach
Work in small, reviewable phases. Do not attempt to build the entire application in one pass.

1. Inspect the repository and report its current state. If it is empty, propose a project structure.
2. Initialize the app and document setup.
3. Create SQL migrations, constraints, indexes, RLS policies, storage policies, and security tests.
4. Implement owner authentication and protected admin routes.
5. Implement event CRUD.
6. Implement post CRUD, draft/publish, visibility, and optional event association.
7. Implement Tiptap editing, image upload, and preview.
8. Implement public homepage, event pages, and article pages.
9. Run lint, type checks, tests, and a production build; fix errors.
10. Document local setup and Vercel deployment.

After each phase, summarize files changed, commands actually run, test results, and remaining issues. Never claim a test passed unless it was run. Ask before destructive operations, deploying, or making changes to external services.

## UX requirements
- Responsive editorial design for desktop and mobile.
- Public pages: `/`, `/events`, `/events/[slug]`, `/posts/[slug]`.
- Admin pages: `/admin`, `/admin/events`, `/admin/events/new`, `/admin/events/[id]`, `/admin/events/[id]/edit`, `/admin/posts`, `/admin/posts/new`, `/admin/posts/[id]/edit`, `/admin/settings`.
- Editor toolbar: paragraphs, H2/H3, bold, italic, underline, strikethrough, lists, blockquote, horizontal rule, links, and images.
- Include loading, empty, error, save-status, and destructive-action confirmation states.
- Do not add comments, likes, social features, or collaborative editing to the MVP.

## Data model baseline
- `profiles`: owner profile linked to `auth.users`.
- `events`: owner, title, slug, description, optional date range, cover path, visibility, timestamps.
- `posts`: owner, optional event, title, slug, excerpt, Tiptap JSONB content, status, visibility, published timestamp, timestamps.
- `post_images`: post, storage path, alt text, optional caption, sort order, timestamp.

Use UUID primary keys, foreign keys, constraints, indexes, and version-controlled SQL migrations. Slug uniqueness must match the routing design. Define deletion behavior explicitly.

## First task
Start by inspecting the repository and reporting what exists. Do not create or modify application files until you have summarized the current state and proposed the first implementation phase.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

