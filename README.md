# My Journal

A personal journal built with the Next.js App Router. Supabase database setup is prepared locally in `supabase/migrations/` and is not applied automatically.

## Run locally

Requires Node.js 20.9 or newer.

```powershell
npm.cmd install
npm.cmd run dev
```

Open [http://localhost:3000](http://localhost:3000). In PowerShell, use `npm.cmd` if the system's script execution policy blocks `npm.ps1`.

The homepage lives in `app/page.tsx`, and its styles are in `app/globals.css`.

## Supabase database setup

The initial migration is [`supabase/migrations/20261026090000_initial_schema.sql`](supabase/migrations/20261026090000_initial_schema.sql). It creates the journal tables, RLS policies, the private `journal-private` Storage bucket, and a private owner registry. The [`supabase/migrations/20261026091000_public_owner_rpc.sql`](supabase/migrations/20261026091000_public_owner_rpc.sql) migration adds a narrowly scoped `public.is_journal_owner()` RPC for server-side authorization. The [`supabase/migrations/20261026100000_public_image_select.sql`](supabase/migrations/20261026100000_public_image_select.sql) migration permits Storage reads only when RLS exposes matching image metadata for a readable post, enabling short-lived URLs for public images while leaving the bucket private. The [`supabase/migrations/20261026105000_post_image_path_isolation.sql`](supabase/migrations/20261026105000_post_image_path_isolation.sql) migration limits post-image metadata and public Storage reads to the owner-scoped `/posts/` path format. The [`supabase/migrations/20261026110000_event_items_schema.sql`](supabase/migrations/20261026110000_event_items_schema.sql) migration adds Event Items, their RLS policies, and narrowly scoped Storage reads for images belonging to publicly readable events. Migrations do not connect to or change a Supabase project by themselves.

The composite event-owner foreign key uses PostgreSQL's column-list form of `ON DELETE SET NULL`, available in PostgreSQL 15 and newer. Check the project database version before applying; Supabase's managed PostgreSQL 14 support ended in July 2026.

### Apply the migration manually

1. In Supabase Authentication settings, disable public sign-ups and invite or create the one owner account.
2. For a new database, open **SQL Editor** and run the initial migration once. If the initial migration has already been applied, do not rerun or replace it; continue with owner provisioning and the follow-up migration below.
3. From **Authentication → Users**, copy the owner's user UUID.
4. In SQL Editor, bind that UUID as the sole journal owner and create the profile if the account existed before the migration:

   ```sql
   insert into private.journal_owner (singleton, user_id)
   values (true, '<OWNER_AUTH_USER_UUID>'::uuid);

   insert into public.profiles (id, display_name, is_public)
   values ('<OWNER_AUTH_USER_UUID>'::uuid, 'My Journal', false)
   on conflict (id) do nothing;
   ```

   Check `private.journal_owner` before inserting: the `singleton` key intentionally allows only one configured owner, and the insert should fail if one is already configured. Keep the `private` schema out of Supabase's exposed API schemas. New Auth users receive a private profile row through a trigger, but only the configured owner can manage journal content.
5. Set the owner's `profiles.is_public` to `true` only when you want the profile and its public posts to be visible. It defaults to `false`; public posts require a public profile, a published status, public post visibility, and either no event or a public event.

### Apply the follow-up migrations

For a database where the initial schema and owner provisioning are already complete, apply `20261026091000_public_owner_rpc.sql`, `20261026100000_public_image_select.sql`, `20261026105000_post_image_path_isolation.sql`, and `20261026110000_event_items_schema.sql`, each once, in timestamp order. Keep the `private` schema out of the Supabase Data API exposed schemas. The owner RPC adds an invoker-rights wrapper in the already exposed `public` schema; it calls the existing private predicate, accepts no UUID argument, and grants function execution only to `authenticated`. The image migration adds public Storage SELECT for image paths referenced by RLS-visible `post_images` rows. The path-isolation migration enforces the owner-scoped `/posts/` namespace for new or updated metadata and narrows public post-image reads to that namespace, while retaining the owner upload/update/delete policies and private bucket. Its CHECK is `NOT VALID` so legacy rows cannot block application; inspect and repair any nonconforming paths before validating it. The Event Items migration adds one namespaced Storage path per item and composes its event-item read rule with the public-post rule in the restrictive SELECT guard. Anonymous Event Item reads are limited by RLS to items whose parent event is public. No bucket or Data API exposure setting needs to change.

The Event Items migration preserves `events.description` as the current plain-text summary and adds a nullable `events.summary` JSONB column for a future Tiptap summary editor. Existing descriptions are not converted or overwritten. Each Event Item has one unique Storage path, a required caption (1–500 characters), optional title and occurrence timestamp, non-negative manual sort order, and timestamps. Its reserved path format is `<owner-uuid>/event-items/<generated-uuid>.(jpg|png|webp)`. The owner segment must match both the authenticated owner and the parent event owner. The next-phase upload action must generate the filename with a UUID, use only the detected image extension, upload with `upsert: false`, and insert that exact path; original filenames must never be used. Deleting an event cascades to its Event Item metadata; Storage objects still require cleanup through the Storage API, as described below.

Post image uploads and saved content use `<owner-uuid>/posts/<generated-uuid>.(jpg|png|webp)`. The path-isolation migration adds a `NOT VALID` CHECK: it immediately rejects new/updated metadata outside that format without scanning or rejecting legacy rows during migration. Its Storage SELECT policies also require the format, so legacy paths outside the namespace are not publicly delivered. Before optionally validating the constraint, inspect legacy rows with:

```sql
select id, post_id, storage_path
from public.post_images
where storage_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/posts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$';
```

If the query returns rows, determine whether their files should be migrated to the supported namespace before running `ALTER TABLE public.post_images VALIDATE CONSTRAINT post_images_storage_path_namespace;`. The app's server-side path validation remains in place as defense in depth.

The Event Items migration reserves `<owner-uuid>/event-items/<generated-uuid>.(jpg|png|webp)`, separate from the post-image namespace. Its insert/update policies reject a path already registered in `post_images`. The existing public-post Storage access remains limited to `/posts/` paths, so a public post cannot expose an Event Item object through that policy.

### Test database access manually

Use a disposable Supabase project or a project with no production journal data. The manual script [`supabase/manual-tests/rls_manual_test.sql`](supabase/manual-tests/rls_manual_test.sql) seeds fixture rows inside a transaction, switches between `anon` and `authenticated` roles, asserts the allowed and denied cases, and rolls the fixture changes back. It is outside `supabase/tests/` so the placeholder-based SQL Editor script is not mistaken for an automatically runnable pgTAP suite.

1. Create the owner account and a separate temporary Auth user for the unauthorized-user case. Public sign-ups should remain disabled; create the temporary account from the dashboard and remove it after testing.
2. Ensure the initial schema, owner RPC, public image-read, post-image path-isolation, and Event Items migrations have been applied in timestamp order and the owner is provisioned as described above. Do not rerun a migration that has already been applied.
3. Open `supabase/manual-tests/rls_manual_test.sql`, replace both UUID placeholders with the owner and temporary user UUIDs, and run the entire file in SQL Editor as a database administrator. It checks public profile/event reads; visibility of standalone and public-event posts; denial for private-event posts, drafts, and private posts; image metadata visibility; Event Item metadata visibility through public/private/other-user events; owner RPC results and grants; non-owner read/write denial; owner CRUD; FK rejection of a mismatched event owner; and image metadata cascade on post deletion.
4. Successful checks emit `PASS` notices. If the editor stops on an error before the final `ROLLBACK`, roll back the open transaction before retrying. The fixtures are database rows only; the test file does not upload or delete Storage files.

For image access, apply the initial schema, owner RPC, public image-read, and post-image path-isolation migrations first. As the owner, upload an image in the post editor and save a draft. Confirm the image displays in the editor, the owner can request `/api/images/<IMAGE_ROW_UUID>`, and anonymous and non-owner sessions receive 404. Publish the post as public with a public profile and public event (or no event), then confirm anonymous and authenticated visitors can request the endpoint and receive image bytes with `Cache-Control: private, no-store`. Change the post to draft/private or its event to private and confirm new anonymous and non-owner requests return 404 while the owner can still preview it. The route checks access on every request and uses only a server-held, five-minute signed Storage URL.

For a separate Storage API check, upload a disposable file using the owner's authenticated session to `journal-private/<owner-uuid>/posts/<generated-uuid>.jpg`. Confirm the owner can upload and download it; anonymous and non-owner authenticated sessions must fail upload and direct download of this unreferenced test object, including when a non-owner uses their own UUID as the first folder. Remove this disposable object through the Storage API after the check. A public image linked to a currently readable post is intentionally accessible through the site's image endpoint. Never create or delete object records by writing to `storage.objects`; use the Storage API. The bucket stays private. Admin uploads use the owner's session and server-side JPEG, PNG, and WebP signature checks, with a 5 MB size limit and generated UUID paths. The editor refreshes its 15-minute owner signed URLs. The public endpoint first validates image metadata and the associated post through RLS, checks publication and event visibility, then fetches the image with a five-minute signed URL held server-side and streams the bytes with `Cache-Control: no-store`; the Storage URL itself is never sent to visitors. Objects are stored with a five-minute cache lifetime. A signed URL is a bearer credential while it exists, so keep its lifetime short.

### Image deletion and editor safety

Deleting images or a post requires both Storage API cleanup and metadata removal because PostgreSQL cascades do not delete object files. Owner-only server actions verify the owner and stored paths, remove files through the Supabase Storage API, check that removal succeeded, then delete metadata or the post. If Storage removal fails, the post or image metadata remains so cleanup can be retried. For Event Items, the database cascades metadata when an event is deleted, but the later owner delete flow must first remove all associated item objects through the Storage API and stop if removal fails. An upload abandoned before its metadata is saved can leave an unreferenced object; clean these periodically through the Storage API. Do not use a PostgreSQL trigger to modify `storage.objects` directly; Storage manages the object store through its API.

The database checks only that `posts.content` is a Tiptap document-shaped JSON object. Before saving, the application must validate the allowed nodes, marks, attributes, link targets, and image references against the editor's supported schema. Render the JSON through the approved Tiptap extensions or a safe renderer; do not inject arbitrary HTML. Validation and rendering checks are application responsibilities, not guarantees provided by this migration.
