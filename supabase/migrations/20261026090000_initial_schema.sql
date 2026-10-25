-- My Journal initial schema.
-- Apply once to the Supabase project after reviewing this migration.
-- The project owner UUID is intentionally provisioned separately in private.journal_owner.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;

create table private.journal_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now()
);

revoke all on table private.journal_owner from public, anon, authenticated;

create function private.is_journal_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.journal_owner as journal_owner
    where journal_owner.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_journal_owner() from public, anon, authenticated;
grant execute on function private.is_journal_owner() to anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  bio text,
  avatar_path text,
  is_public boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profiles_display_name_length check (
    display_name is null or char_length(btrim(display_name)) between 1 and 120
  ),
  constraint profiles_bio_length check (
    bio is null or char_length(bio) <= 2000
  ),
  constraint profiles_avatar_path_nonempty check (
    avatar_path is null or (avatar_path = btrim(avatar_path) and avatar_path <> '')
  )
);

create function private.is_public_profile(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = profile_id and profile.is_public
  );
$$;

revoke all on function private.is_public_profile(uuid) from public, anon, authenticated;
grant execute on function private.is_public_profile(uuid) to anon, authenticated;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  slug text not null unique,
  description text,
  start_date date,
  end_date date,
  cover_image_path text,
  visibility text not null default 'private',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint events_title_length check (
    title = btrim(title) and char_length(title) between 1 and 200
  ),
  constraint events_slug_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 160
  ),
  constraint events_description_length check (
    description is null or char_length(description) <= 10000
  ),
  constraint events_date_range check (
    start_date is null or end_date is null or end_date >= start_date
  ),
  constraint events_visibility check (visibility in ('private', 'public')),
  constraint events_cover_image_path_nonempty check (
    cover_image_path is null or
    (cover_image_path = btrim(cover_image_path) and cover_image_path <> '')
  ),
  -- Required as the referenced key for posts' owner-consistent composite FK.
  constraint events_id_user_id_key unique (id, user_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid,
  title text not null,
  slug text not null unique,
  excerpt text,
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  status text not null default 'draft',
  visibility text not null default 'private',
  published_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint posts_title_length check (
    title = btrim(title) and char_length(title) between 1 and 200
  ),
  constraint posts_slug_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 160
  ),
  constraint posts_excerpt_length check (
    excerpt is null or char_length(excerpt) <= 500
  ),
  constraint posts_content_is_tiptap_document check (
    pg_catalog.jsonb_typeof(content) = 'object' and content ->> 'type' = 'doc'
  ),
  constraint posts_status check (status in ('draft', 'published')),
  constraint posts_visibility check (visibility in ('private', 'public')),
  constraint posts_published_at_matches_status check (
    (status = 'published' and published_at is not null) or
    (status = 'draft' and published_at is null)
  ),
  -- MATCH SIMPLE lets a NULL event_id represent a standalone post. If an
  -- event is deleted, only event_id is cleared and the post remains owned.
  constraint posts_event_owner_fkey
    foreign key (event_id, user_id)
    references public.events (id, user_id)
    match simple
    on delete set null (event_id)
);

create table public.post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  storage_path text not null unique,
  alt_text text,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  constraint post_images_storage_path_nonempty check (
    storage_path = btrim(storage_path) and storage_path <> ''
  ),
  constraint post_images_alt_text_length check (
    alt_text is null or char_length(alt_text) <= 500
  ),
  constraint post_images_caption_length check (
    caption is null or char_length(caption) <= 1000
  ),
  constraint post_images_sort_order_nonnegative check (sort_order >= 0)
);

create index events_user_updated_idx on public.events (user_id, updated_at desc);
create index events_public_idx on public.events (start_date desc, id)
  where visibility = 'public';
create index posts_user_updated_idx on public.posts (user_id, updated_at desc);
create index posts_event_idx on public.posts (event_id);
create index posts_public_listing_idx on public.posts (published_at desc, id)
  where status = 'published' and visibility = 'public';
create index post_images_post_sort_idx on public.post_images (post_id, sort_order, id);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row execute function private.set_updated_at();

create trigger posts_set_updated_at
before update on public.posts
for each row execute function private.set_updated_at();

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger my_journal_on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.posts enable row level security;
alter table public.post_images enable row level security;

-- Public visitors can select only explicitly public profile fields. Owner-only
-- fields and write operations remain available to the configured owner.
revoke all on table public.profiles, public.events, public.posts, public.post_images
from public, anon, authenticated;

grant select (display_name, bio, avatar_path) on public.profiles to anon;
grant select, insert, update, delete on public.profiles to authenticated;

grant select (
  id, title, slug, description, start_date, end_date,
  cover_image_path, visibility, created_at, updated_at
) on public.events to anon;
grant select, insert, update, delete on public.events to authenticated;

grant select (
  id, event_id, title, slug, excerpt, content, status, visibility,
  published_at, created_at, updated_at
) on public.posts to anon;
grant select, insert, update, delete on public.posts to authenticated;

grant select on public.post_images to anon;
grant select, insert, update, delete on public.post_images to authenticated;

create policy profiles_select_public_or_owner
on public.profiles for select to anon, authenticated
using (
  is_public or (
    (select private.is_journal_owner()) and id = (select auth.uid())
  )
);
create policy profiles_insert_owner
on public.profiles for insert to authenticated
with check (
  (select private.is_journal_owner()) and id = (select auth.uid())
);
create policy profiles_update_owner
on public.profiles for update to authenticated
using (
  (select private.is_journal_owner()) and id = (select auth.uid())
)
with check (
  (select private.is_journal_owner()) and id = (select auth.uid())
);
create policy profiles_delete_owner
on public.profiles for delete to authenticated
using (
  (select private.is_journal_owner()) and id = (select auth.uid())
);

create policy events_select_public_or_owner
on public.events for select to anon, authenticated
using (
  visibility = 'public' or (
    (select private.is_journal_owner()) and user_id = (select auth.uid())
  )
);
create policy events_insert_owner
on public.events for insert to authenticated
with check (
  (select private.is_journal_owner()) and user_id = (select auth.uid())
);
create policy events_update_owner
on public.events for update to authenticated
using (
  (select private.is_journal_owner()) and user_id = (select auth.uid())
)
with check (
  (select private.is_journal_owner()) and user_id = (select auth.uid())
);
create policy events_delete_owner
on public.events for delete to authenticated
using (
  (select private.is_journal_owner()) and user_id = (select auth.uid())
);

create policy posts_select_public_or_owner
on public.posts for select to anon, authenticated
using (
  (
    status = 'published'
    and visibility = 'public'
    and (select private.is_public_profile(posts.user_id))
    and (
      event_id is null
      or exists (
        select 1
        from public.events as event
        where event.id = posts.event_id and event.visibility = 'public'
      )
    )
  )
  or (
    (select private.is_journal_owner()) and user_id = (select auth.uid())
  )
);
create policy posts_insert_owner
on public.posts for insert to authenticated
with check (
  (select private.is_journal_owner()) and user_id = (select auth.uid())
);
create policy posts_update_owner
on public.posts for update to authenticated
using (
  (select private.is_journal_owner()) and user_id = (select auth.uid())
)
with check (
  (select private.is_journal_owner()) and user_id = (select auth.uid())
);
create policy posts_delete_owner
on public.posts for delete to authenticated
using (
  (select private.is_journal_owner()) and user_id = (select auth.uid())
);

create policy post_images_select_visible_post_or_owner
on public.post_images for select to anon, authenticated
using (
  exists (
    select 1
    from public.posts as post
    where post.id = post_images.post_id
  )
);
create policy post_images_insert_owner
on public.post_images for insert to authenticated
with check (
  (select private.is_journal_owner())
  and exists (
    select 1
    from public.posts as post
    where post.id = post_images.post_id
      and post.user_id = (select auth.uid())
  )
);
create policy post_images_update_owner
on public.post_images for update to authenticated
using (
  (select private.is_journal_owner())
  and exists (
    select 1
    from public.posts as post
    where post.id = post_images.post_id
      and post.user_id = (select auth.uid())
  )
)
with check (
  (select private.is_journal_owner())
  and exists (
    select 1
    from public.posts as post
    where post.id = post_images.post_id
      and post.user_id = (select auth.uid())
  )
);
create policy post_images_delete_owner
on public.post_images for delete to authenticated
using (
  (select private.is_journal_owner())
  and exists (
    select 1
    from public.posts as post
    where post.id = post_images.post_id
      and post.user_id = (select auth.uid())
  )
);

-- One private bucket holds all media. Its object policies allow only the
-- configured owner; public delivery must use server-checked short-lived URLs.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'journal-private',
  'Journal private media',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy my_journal_storage_select_owner
on storage.objects for select to authenticated
using (
  bucket_id = 'journal-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_journal_owner())
);
create policy my_journal_storage_insert_owner
on storage.objects for insert to authenticated
with check (
  bucket_id = 'journal-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_journal_owner())
);
create policy my_journal_storage_update_owner
on storage.objects for update to authenticated
using (
  bucket_id = 'journal-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_journal_owner())
)
with check (
  bucket_id = 'journal-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_journal_owner())
);
create policy my_journal_storage_delete_owner
on storage.objects for delete to authenticated
using (
  bucket_id = 'journal-private'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_journal_owner())
);

-- Restrictive guards keep an unrelated permissive Storage policy from
-- accidentally opening this bucket to anonymous or non-owner access.
create policy my_journal_storage_guard_select
on storage.objects as restrictive for select to public
using (
  bucket_id <> 'journal-private'
  or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_journal_owner())
  )
);
create policy my_journal_storage_guard_insert
on storage.objects as restrictive for insert to public
with check (
  bucket_id <> 'journal-private'
  or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_journal_owner())
  )
);
create policy my_journal_storage_guard_update
on storage.objects as restrictive for update to public
using (
  bucket_id <> 'journal-private'
  or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_journal_owner())
  )
)
with check (
  bucket_id <> 'journal-private'
  or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_journal_owner())
  )
);
create policy my_journal_storage_guard_delete
on storage.objects as restrictive for delete to public
using (
  bucket_id <> 'journal-private'
  or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_journal_owner())
  )
);

commit;
