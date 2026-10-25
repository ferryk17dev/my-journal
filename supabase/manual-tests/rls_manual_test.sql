-- Manual RLS integration test for a Supabase SQL Editor session.
-- Replace both UUID placeholders below. Run the whole script as a database
-- administrator only in a dedicated/disposable test project after applying
-- all migrations in timestamp order and provisioning owner. Both UUIDs must
-- belong to existing Auth users; owner must also be in private.journal_owner.
-- Fixture writes are rolled back. No Storage objects are created or removed.

begin;

select pg_catalog.set_config(
  'my_journal_test.owner_id',
  '<OWNER_AUTH_USER_UUID>',
  true
);
select pg_catalog.set_config(
  'my_journal_test.other_user_id',
  '<UNAUTHORIZED_AUTH_USER_UUID>',
  true
);

do $preflight$
begin
  if pg_catalog.strpos(current_setting('my_journal_test.owner_id'), '<') > 0
     or pg_catalog.strpos(current_setting('my_journal_test.other_user_id'), '<') > 0 then
    raise exception 'Replace both UUID placeholders before running this test.';
  end if;

  if current_setting('my_journal_test.owner_id')::uuid =
     current_setting('my_journal_test.other_user_id')::uuid then
    raise exception 'The owner and unauthorized test user must be different.';
  end if;

  if not exists (
    select 1 from auth.users
    where id = current_setting('my_journal_test.owner_id')::uuid
  ) or not exists (
    select 1 from auth.users
    where id = current_setting('my_journal_test.other_user_id')::uuid
  ) then
    raise exception 'Both UUIDs must belong to existing Supabase Auth users.';
  end if;

  if not exists (
    select 1 from private.journal_owner
    where user_id = current_setting('my_journal_test.owner_id')::uuid
  ) then
    raise exception 'The owner UUID is not provisioned in private.journal_owner.';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = current_setting('my_journal_test.owner_id')::uuid
  ) then
    raise exception 'The owner profile is missing; run the documented profile bootstrap first.';
  end if;

  if pg_catalog.to_regprocedure('public.is_journal_owner()') is null then
    raise exception 'Apply the public owner RPC migration before running this test.';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.is_journal_owner()', 'EXECUTE') then
    raise exception 'Anonymous role must not execute public.is_journal_owner().';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', 'public.is_journal_owner()', 'EXECUTE') then
    raise exception 'Authenticated role must be able to execute public.is_journal_owner().';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'my_journal_storage_select_readable_post_images',
        'my_journal_storage_select_readable_event_items'
      )
  ) then
    raise exception 'Public Storage image SELECT policies are still installed; apply the private image proxy migration.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'my_journal_storage_guard_select'
      and permissive = 'RESTRICTIVE'
      and cmd = 'SELECT'
  ) then
    raise exception 'The owner-only restrictive Storage SELECT guard is missing.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'my_journal_storage_select_owner'
      and cmd = 'SELECT'
      and qual like '%object.list%'
      and qual like '%object.delete%'
      and qual like '%object.upload_update%'
  ) then
    raise exception 'Storage owner SELECT must be limited to object listing, not downloads or signed URLs.';
  end if;

  if pg_catalog.has_table_privilege('anon', 'private.journal_owner', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'private.journal_owner', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'private.journal_owner', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'private.journal_owner', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'private.journal_owner', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'private.journal_owner', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'private.journal_owner', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'private.journal_owner', 'DELETE') then
    raise exception 'API roles must not read or modify private.journal_owner directly.';
  end if;
end;
$preflight$;

-- Create deterministic fixtures. The transaction rollback removes these rows
-- and restores the existing profile values after the test completes.
update public.profiles
set display_name = 'RLS Test Owner', is_public = true
where id = current_setting('my_journal_test.owner_id')::uuid;

insert into public.events (user_id, title, slug, visibility)
values
  (current_setting('my_journal_test.owner_id')::uuid,
   'RLS Test Public Event', 'rls-test-public-event', 'public'),
  (current_setting('my_journal_test.owner_id')::uuid,
   'RLS Test Private Event', 'rls-test-private-event', 'private'),
  (current_setting('my_journal_test.other_user_id')::uuid,
   'RLS Test Other User Event', 'rls-test-other-user-event', 'private')
on conflict (slug) do update
set user_id = excluded.user_id,
    title = excluded.title,
    visibility = excluded.visibility;

select pg_catalog.set_config(
  'my_journal_test.other_event_id',
  (select id::text from public.events where slug = 'rls-test-other-user-event'),
  true
);

insert into public.posts (
  user_id, event_id, title, slug, status, visibility, published_at
)
select
  current_setting('my_journal_test.owner_id')::uuid,
  event.id,
  'RLS Test ' || fixture.slug,
  fixture.slug,
  fixture.status,
  fixture.visibility,
  case when fixture.status = 'published' then pg_catalog.now() else null end
from (values
  ('rls-test-public-standalone'::text, null::text, 'published'::text, 'public'::text),
  ('rls-test-public-event-post', 'rls-test-public-event', 'published', 'public'),
  ('rls-test-private-event-post', 'rls-test-private-event', 'published', 'public'),
  ('rls-test-draft-post', null, 'draft', 'public'),
  ('rls-test-private-post', null, 'published', 'private')
) as fixture(slug, event_slug, status, visibility)
left join public.events as event on event.slug = fixture.event_slug
on conflict (slug) do update
set user_id = excluded.user_id,
    event_id = excluded.event_id,
    title = excluded.title,
    status = excluded.status,
    visibility = excluded.visibility,
    published_at = excluded.published_at;

insert into public.post_images (post_id, storage_path, alt_text)
select
  post.id,
  current_setting('my_journal_test.owner_id') || '/posts/' || post.id::text || '.jpg',
  post.title
from public.posts as post
where post.slug like 'rls-test-%'
on conflict (storage_path) do update
set post_id = excluded.post_id,
    alt_text = excluded.alt_text;

-- Event Item paths must follow the separate event-items namespace. These are
-- metadata-only fixtures: Storage objects are intentionally not created.
insert into public.event_items (
  event_id, title, caption, sort_order, storage_path
)
select
  event.id,
  'RLS Test Item',
  'RLS test Event Item caption',
  0,
  event.user_id::text || '/event-items/' || gen_random_uuid()::text || '.jpg'
from public.events as event
where event.slug in (
  'rls-test-public-event',
  'rls-test-private-event',
  'rls-test-other-user-event'
);

-- Anonymous visitor: only the public profile, public event, public standalone
-- post, and public post attached to the public event should be visible.
set local role anon;
select pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);

do $anon_checks$
declare
  visible_count integer;
begin
  select count(*) into visible_count
  from public.profiles where display_name = 'RLS Test Owner';
  if visible_count <> 1 then
    raise exception 'FAIL: expected the opted-in public profile; got %', visible_count;
  end if;

  select count(*) into visible_count
  from public.events where slug like 'rls-test-%';
  if visible_count <> 1 then
    raise exception 'FAIL: expected only the public event; got %', visible_count;
  end if;

  select count(*) into visible_count
  from public.posts where slug like 'rls-test-%';
  if visible_count <> 2 then
    raise exception 'FAIL: expected two public published posts; got %', visible_count;
  end if;

  select count(*) into visible_count
  from public.posts
  where slug in (
    'rls-test-private-event-post',
    'rls-test-draft-post',
    'rls-test-private-post'
  );
  if visible_count <> 0 then
    raise exception 'FAIL: anonymous role can see a draft, private post, or private-event post';
  end if;

  select count(*) into visible_count
  from public.post_images as image
  join public.posts as post on post.id = image.post_id
  where post.slug like 'rls-test-%';
  if visible_count <> 2 then
    raise exception 'FAIL: expected metadata for two readable posts; got %', visible_count;
  end if;

  select count(*) into visible_count
  from public.event_items as item
  join public.events as event on event.id = item.event_id
  where event.slug like 'rls-test-%';
  if visible_count <> 1 then
    raise exception 'FAIL: anonymous role should see Event Item metadata only for the public event; got %', visible_count;
  end if;

  raise notice 'PASS: anonymous read and image-metadata checks';
end;
$anon_checks$;

reset role;

-- Authenticated non-owner: public content remains readable, private content is
-- hidden, and writes are denied even when the caller supplies their own UUID.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', current_setting('my_journal_test.other_user_id'),
    'role', 'authenticated'
  )::text,
  true
);

do $non_owner_checks$
declare
  visible_count integer;
  affected_count integer;
  insert_was_denied boolean := false;
begin
  if public.is_journal_owner() then
    raise exception 'FAIL: non-owner RPC returned true';
  end if;

  select count(*) into visible_count
  from public.posts where slug like 'rls-test-%';
  if visible_count <> 2 then
    raise exception 'FAIL: non-owner should see the two public posts; got %', visible_count;
  end if;

  select count(*) into visible_count
  from public.posts
  where slug in (
    'rls-test-private-event-post',
    'rls-test-draft-post',
    'rls-test-private-post'
  );
  if visible_count <> 0 then
    raise exception 'FAIL: non-owner can see private journal rows';
  end if;

  select count(*) into visible_count
  from public.post_images as image
  join public.posts as post on post.id = image.post_id
  where post.slug like 'rls-test-%';
  if visible_count <> 2 then
    raise exception 'FAIL: non-owner should see only metadata for readable posts; got %', visible_count;
  end if;

  select count(*) into visible_count
  from public.event_items as item
  join public.events as event on event.id = item.event_id
  where event.slug like 'rls-test-%';
  if visible_count <> 1 then
    raise exception 'FAIL: non-owner should see Event Item metadata only for the public event; got %', visible_count;
  end if;

  insert_was_denied := false;
  begin
    insert into public.event_items (
      event_id, caption, storage_path
    )
    select event.id, 'Unauthorized Event Item',
      current_setting('my_journal_test.other_user_id') || '/event-items/' || gen_random_uuid()::text || '.jpg'
    from public.events as event
    where event.slug = 'rls-test-public-event';
    raise exception 'FAIL: non-owner Event Item insert unexpectedly succeeded';
  exception
    when insufficient_privilege then
      insert_was_denied := true;
  end;
  if not insert_was_denied then
    raise exception 'FAIL: non-owner Event Item insert was not denied';
  end if;

  update public.event_items as item set caption = 'unauthorized update'
  from public.events as event
  where event.id = item.event_id and event.slug = 'rls-test-public-event';
  get diagnostics affected_count = row_count;
  if affected_count <> 0 then
    raise exception 'FAIL: non-owner updated a public Event Item';
  end if;

  delete from public.event_items as item
  using public.events as event
  where event.id = item.event_id and event.slug = 'rls-test-public-event';
  get diagnostics affected_count = row_count;
  if affected_count <> 0 then
    raise exception 'FAIL: non-owner deleted a public Event Item';
  end if;

  begin
    insert into public.events (user_id, title, slug, visibility)
    values (
      current_setting('my_journal_test.other_user_id')::uuid,
      'Unauthorized event', 'rls-test-unauthorized-event', 'private'
    );
    raise exception 'FAIL: non-owner event insert unexpectedly succeeded';
  exception
    when insufficient_privilege then
      insert_was_denied := true;
  end;
  if not insert_was_denied then
    raise exception 'FAIL: non-owner event insert was not denied';
  end if;

  insert_was_denied := false;
  begin
    insert into public.posts (user_id, title, slug, content, status, visibility)
    values (
      current_setting('my_journal_test.other_user_id')::uuid,
      'Unauthorized post', 'rls-test-unauthorized-post',
      '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
      'draft', 'private'
    );
    raise exception 'FAIL: non-owner post insert unexpectedly succeeded';
  exception
    when insufficient_privilege then
      insert_was_denied := true;
  end;
  if not insert_was_denied then
    raise exception 'FAIL: non-owner post insert was not denied';
  end if;

  insert_was_denied := false;
  begin
    insert into public.post_images (post_id, storage_path)
    select post.id,
      current_setting('my_journal_test.other_user_id') || '/posts/' || gen_random_uuid()::text || '.jpg'
    from public.posts as post
    where post.slug = 'rls-test-public-standalone';
    raise exception 'FAIL: non-owner image metadata insert unexpectedly succeeded';
  exception
    when insufficient_privilege then
      insert_was_denied := true;
  end;
  if not insert_was_denied then
    raise exception 'FAIL: non-owner image metadata insert was not denied';
  end if;

  update public.posts set excerpt = 'unauthorized update'
  where slug = 'rls-test-public-standalone';
  get diagnostics affected_count = row_count;
  if affected_count <> 0 then
    raise exception 'FAIL: non-owner updated a public post';
  end if;

  delete from public.posts where slug = 'rls-test-public-event-post';
  get diagnostics affected_count = row_count;
  if affected_count <> 0 then
    raise exception 'FAIL: non-owner deleted a public post';
  end if;

  update public.post_images
  set alt_text = 'unauthorized image update'
  where post_id = (select id from public.posts where slug = 'rls-test-public-standalone');
  get diagnostics affected_count = row_count;
  if affected_count <> 0 then
    raise exception 'FAIL: non-owner updated public image metadata';
  end if;

  delete from public.post_images
  where post_id = (select id from public.posts where slug = 'rls-test-public-event-post');
  get diagnostics affected_count = row_count;
  if affected_count <> 0 then
    raise exception 'FAIL: non-owner deleted public image metadata';
  end if;

  raise notice 'PASS: non-owner read restrictions and write denials';
end;
$non_owner_checks$;

reset role;

-- Configured owner: can read private rows and perform content CRUD. Also prove
-- the composite FK rejects a post associated with another user's event.
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub', current_setting('my_journal_test.owner_id'),
    'role', 'authenticated'
  )::text,
  true
);

do $owner_checks$
declare
  visible_count integer;
  affected_count integer;
  new_event_id uuid;
  new_post_id uuid;
  mismatch_was_denied boolean := false;
begin
  if not public.is_journal_owner() then
    raise exception 'FAIL: owner RPC did not return true';
  end if;

  select count(*) into visible_count
  from public.posts where slug like 'rls-test-%';
  if visible_count <> 5 then
    raise exception 'FAIL: owner should read all five fixture posts; got %', visible_count;
  end if;

  select count(*) into visible_count
  from public.post_images as image
  join public.posts as post on post.id = image.post_id
  where post.slug like 'rls-test-%';
  if visible_count <> 5 then
    raise exception 'FAIL: owner should read all five image metadata rows; got %', visible_count;
  end if;

  select count(*) into visible_count
  from public.event_items as item
  join public.events as event on event.id = item.event_id
  where event.slug like 'rls-test-%';
  if visible_count <> 2 then
    raise exception 'FAIL: owner should read items for their public and private events, but not another user event; got %', visible_count;
  end if;

  insert into public.events (user_id, title, slug, visibility)
  values (
    current_setting('my_journal_test.owner_id')::uuid,
    'Owner write event', 'rls-test-owner-write-event', 'private'
  );
  select id into new_event_id
  from public.events where slug = 'rls-test-owner-write-event';

  insert into public.posts (user_id, event_id, title, slug, status, visibility)
  values (
    current_setting('my_journal_test.owner_id')::uuid,
    new_event_id,
    'Owner write post', 'rls-test-owner-write-post', 'draft', 'private'
  )
  returning id into new_post_id;

  insert into public.post_images (post_id, storage_path, alt_text)
  values
    (
      new_post_id,
      current_setting('my_journal_test.owner_id') || '/posts/' || new_post_id::text || '.jpg',
      'Owner write image'
    ),
    (
      new_post_id,
      current_setting('my_journal_test.owner_id') || '/posts/' || gen_random_uuid()::text || '.png',
      'Owner cascade image'
    );

  update public.posts set excerpt = 'owner update'
  where id = new_post_id;
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'FAIL: owner update should affect one post; got %', affected_count;
  end if;

  update public.post_images set alt_text = 'Owner updated image'
  where storage_path = current_setting('my_journal_test.owner_id') || '/posts/' || new_post_id::text || '.jpg';
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'FAIL: owner image metadata update should affect one row; got %', affected_count;
  end if;

  delete from public.post_images
  where storage_path = current_setting('my_journal_test.owner_id') || '/posts/' || new_post_id::text || '.jpg';
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'FAIL: owner image metadata delete should affect one row; got %', affected_count;
  end if;

  begin
    insert into public.posts (user_id, event_id, title, slug, status, visibility)
    values (
      current_setting('my_journal_test.owner_id')::uuid,
      current_setting('my_journal_test.other_event_id')::uuid,
      'Mismatched owner event', 'rls-test-mismatched-event-post', 'draft', 'private'
    );
    raise exception 'FAIL: composite FK allowed a post to reference another user event';
  exception
    when foreign_key_violation then
      mismatch_was_denied := true;
  end;
  if not mismatch_was_denied then
    raise exception 'FAIL: mismatched event ownership was not rejected';
  end if;

  insert into public.event_items (
    event_id, title, caption, occurred_at, sort_order, storage_path
  )
  values (
    new_event_id,
    'Owner-created Event Item',
    'Owner-created Event Item caption',
    pg_catalog.now(),
    2,
    current_setting('my_journal_test.owner_id') || '/event-items/' || gen_random_uuid()::text || '.webp'
  );

  update public.event_items set caption = 'Owner-updated Event Item caption'
  where event_id = new_event_id and title = 'Owner-created Event Item';
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'FAIL: owner Event Item update should affect one row; got %', affected_count;
  end if;

  delete from public.event_items
  where event_id = new_event_id and title = 'Owner-created Event Item';
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'FAIL: owner Event Item delete should affect one row; got %', affected_count;
  end if;

  delete from public.events where id = new_event_id;
  select event_id into new_event_id from public.posts where id = new_post_id;
  if new_event_id is not null then
    raise exception 'FAIL: deleting an event should clear only the optional event_id';
  end if;

  delete from public.posts where id = new_post_id;
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'FAIL: owner delete should affect one post; got %', affected_count;
  end if;

  select count(*) into visible_count
  from public.post_images
  where post_id = new_post_id;
  if visible_count <> 0 then
    raise exception 'FAIL: deleting a post should cascade its image metadata';
  end if;

  raise notice 'PASS: owner CRUD, Event Item owner CRUD, event ownership FK, and metadata cascade';
end;
$owner_checks$;

reset role;
rollback;

-- Storage object test (must use the Storage API, not SQL against storage.objects):
-- 1. Upload a test file as the owner to
--    <OWNER_AUTH_USER_UUID>/posts/<GENERATED_UUID>.jpg in journal-private.
-- 2. Confirm owner upload, listing, and deletion succeed. Direct download and
--    signed-URL creation must fail for owner, anonymous, and non-owner clients.
--    Non-owner uploads must fail, including a path under their own UUID folder.
-- 3. Public image bytes are served only by application routes that recheck
--    current visibility and never return a Storage URL. Never expose the
--    service-role key or download a client-supplied path.
