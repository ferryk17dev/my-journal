# My Journal — MVP Product Specification

## Concept
A personal blog that supports both event-based journals and standalone articles. Example event: "Trip to UK". The owner can create several posts under that event, while also writing unrelated posts. Each event and post can be private or public.

## MVP user flows
1. Owner signs in.
2. Owner creates or edits an event.
3. Owner creates a post, optionally associates it with an event, writes with a visual rich-text editor, and adds photos.
4. Owner saves as draft or publishes.
5. Owner previews content.
6. Anonymous visitors browse only public published content.

## Routes
### Public
- `/` — introduction, recent public posts, featured public events
- `/events` — public event list
- `/events/[slug]` — event details and public published posts
- `/posts/[slug]` — public article

### Owner/admin
- `/login`
- `/admin` — dashboard
- `/admin/events`
- `/admin/events/new`
- `/admin/events/[id]`
- `/admin/events/[id]/edit`
- `/admin/posts`
- `/admin/posts/new`
- `/admin/posts/[id]/edit`
- `/admin/settings`

## Data model
### `profiles`
- `id UUID PRIMARY KEY REFERENCES auth.users`
- `display_name TEXT`
- `bio TEXT NULL`
- `avatar_path TEXT NULL`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

### `events`
- `id UUID PRIMARY KEY`
- `user_id UUID NOT NULL REFERENCES auth.users`
- `title TEXT NOT NULL`
- `slug TEXT NOT NULL`
- `description TEXT NULL`
- `start_date DATE NULL`
- `end_date DATE NULL`
- `cover_image_path TEXT NULL`
- `visibility TEXT NOT NULL CHECK (visibility IN ('private','public'))`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

### `posts`
- `id UUID PRIMARY KEY`
- `user_id UUID NOT NULL REFERENCES auth.users`
- `event_id UUID NULL REFERENCES events`
- `title TEXT NOT NULL`
- `slug TEXT NOT NULL`
- `excerpt TEXT NULL`
- `content JSONB NOT NULL` — Tiptap document
- `status TEXT NOT NULL CHECK (status IN ('draft','published'))`
- `visibility TEXT NOT NULL CHECK (visibility IN ('private','public'))`
- `published_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ`
- `updated_at TIMESTAMPTZ`

### `post_images`
- `id UUID PRIMARY KEY`
- `post_id UUID NOT NULL REFERENCES posts`
- `storage_path TEXT NOT NULL`
- `alt_text TEXT NULL`
- `caption TEXT NULL`
- `sort_order INTEGER NOT NULL DEFAULT 0`
- `created_at TIMESTAMPTZ`

Use explicit foreign-key deletion behavior, indexes, slug uniqueness, and SQL migrations. A post may have no event. Define profile creation behavior when the owner account is created.

## Visibility and publishing logic
A public visitor can read a post only if:
- `status = 'published'`
- post `visibility = 'public'`
- its owner/profile is intended for public display
- if `event_id` is set, the event is also public

A public visitor can read an event only if its `visibility = 'public'`. Public event pages must list only posts satisfying all public visibility and publication conditions. Drafts and private content must not leak through metadata, API responses, search, media URLs, or logs.

## Storage
Store image files in Supabase Storage and file paths in PostgreSQL. Prefer a private bucket with authorization-aware signed URLs for private images. Do not assume that hiding an image in the UI makes the file private.

## Editor
Use Tiptap and store its JSON document in `posts.content`. Support paragraphs, H2/H3, bold, italic, underline, strikethrough, bullet and ordered lists, blockquotes, horizontal rules, links, and image insertion. Validate allowed nodes/marks and safely render stored content. Include preview, save status, upload validation, and unsaved-change warning.

## Security
- One owner account only for MVP; disable public registration.
- Protect admin routes and every mutation server-side.
- Enable RLS and explicit CRUD policies on exposed tables.
- Never trust a user ID supplied by the browser.
- Keep service-role secrets and database credentials server-side only.
- Test allowed and denied access, especially public posts attached to private events.
- Validate user inputs with Zod and handle errors without exposing secrets.

## Acceptance criteria
- Owner can create, edit, and delete events.
- Owner can create standalone and event-associated posts.
- Owner can save drafts, publish, unpublish, and change visibility.
- Rich-text content and images persist across sessions.
- Anonymous visitors can browse public published content without logging in.
- Anonymous visitors cannot access drafts, private posts, private events, or their protected images.
- Making an event private immediately hides its associated posts from public access.
- Responsive public pages and admin UI work on desktop and mobile.
- Lint, type checks, tests, and production build pass; results are reported truthfully.
- README explains local setup, Supabase configuration, migrations, storage, owner setup, environment variables, and Vercel deployment.

## Out of scope for MVP
Comments, likes, multi-user registration, social features, collaborative editing, complex autosave synchronization, and advanced analytics.
