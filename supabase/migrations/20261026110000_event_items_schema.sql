-- Event Items: one namespaced private Storage object and captioned occurrence per row.
-- Apply once after the initial schema, owner RPC, and public image migrations.

begin;

-- Keep description as the existing plain-text summary for compatibility.
-- Rich-text editing can adopt summary without rewriting legacy descriptions.
alter table public.events
  add column summary jsonb;

comment on column public.events.summary is
  'Optional Tiptap document for the event summary; description remains the legacy plain-text summary.';

-- The original anonymous event grant is column-scoped, so explicitly add
-- access to the new summary column. Event row visibility remains RLS-filtered.
grant select (summary) on public.events to anon;

create table public.event_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text,
  caption text not null,
  occurred_at timestamptz,
  sort_order integer not null default 0,
  storage_path text not null unique,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint event_items_title_length check (
    title is null or (title = btrim(title) and char_length(title) between 1 and 200)
  ),
  constraint event_items_caption_length check (
    caption = btrim(caption) and char_length(caption) between 1 and 500
  ),
  constraint event_items_sort_order_nonnegative check (sort_order >= 0),
  constraint event_items_storage_path_nonempty check (
    storage_path = btrim(storage_path) and storage_path <> ''
  ),
  -- Reserve a dedicated owner/event-items namespace, disjoint from the
  -- existing <owner>/posts/<uuid> post-image paths. No extra path segments,
  -- caller-supplied filenames, or other asset namespaces are accepted.
  constraint event_items_storage_path_namespace check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/event-items/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
  )
);

create index event_items_event_sort_idx
  on public.event_items (event_id, sort_order, id);

create trigger event_items_set_updated_at
before update on public.event_items
for each row execute function private.set_updated_at();

alter table public.event_items enable row level security;

revoke all on table public.event_items from public, anon, authenticated;
grant select on public.event_items to anon;
grant select, insert, update, delete on public.event_items to authenticated;

-- The parent events SELECT policy is evaluated with RLS. Anonymous users
-- therefore see item metadata only when the parent event is public; the owner
-- can also read items under the existing owner branch of that policy.
create policy event_items_select_visible_event
on public.event_items for select to anon, authenticated
using (
  exists (
    select 1
    from public.events as event
    where event.id = event_items.event_id
  )
);

create policy event_items_insert_owner
on public.event_items for insert to authenticated
with check (
  (select private.is_journal_owner())
  and exists (
    select 1
    from public.events as event
    where event.id = event_items.event_id
      and event.user_id = (select auth.uid())
  )
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
  and split_part(storage_path, '/', 2) = 'event-items'
  and not exists (
    select 1
    from public.post_images as post_image
    where post_image.storage_path = event_items.storage_path
  )
);

create policy event_items_update_owner
on public.event_items for update to authenticated
using (
  (select private.is_journal_owner())
  and exists (
    select 1
    from public.events as event
    where event.id = event_items.event_id
      and event.user_id = (select auth.uid())
  )
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
  and split_part(storage_path, '/', 2) = 'event-items'
)
with check (
  (select private.is_journal_owner())
  and exists (
    select 1
    from public.events as event
    where event.id = event_items.event_id
      and event.user_id = (select auth.uid())
  )
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
  and split_part(storage_path, '/', 2) = 'event-items'
  and not exists (
    select 1
    from public.post_images as post_image
    where post_image.storage_path = event_items.storage_path
  )
);

create policy event_items_delete_owner
on public.event_items for delete to authenticated
using (
  (select private.is_journal_owner())
  and exists (
    select 1
    from public.events as event
    where event.id = event_items.event_id
      and event.user_id = (select auth.uid())
  )
);

-- A public object read is allowed only when its event item is visible through
-- event_items RLS. The bucket remains private and owner write policies remain
-- unchanged.
create policy my_journal_storage_select_readable_event_items
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'journal-private'
  and exists (
    select 1
    from public.event_items as item
    where item.storage_path = objects.name
  )
);

-- Compose the existing owner and public-post image access with event-item
-- image access. The post_images/event_items subqueries are themselves RLS
-- filtered, so private parents do not make their objects readable.
drop policy if exists my_journal_storage_guard_select on storage.objects;
create policy my_journal_storage_guard_select
on storage.objects as restrictive for select to public
using (
  bucket_id <> 'journal-private'
  or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_journal_owner())
  )
  or exists (
    select 1
    from public.post_images as image
    where image.storage_path = objects.name
      and image.storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/posts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
  )
  or exists (
    select 1
    from public.event_items as item
    where item.storage_path = objects.name
  )
);

commit;
