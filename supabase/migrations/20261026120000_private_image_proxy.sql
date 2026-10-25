-- Public image delivery is proxied through the application so visibility is
-- rechecked on every request. Remove Storage SELECT for public roles; an
-- already-issued signed URL cannot be revoked by changing RLS policies.

begin;

drop policy if exists my_journal_storage_select_readable_post_images
  on storage.objects;
drop policy if exists my_journal_storage_select_readable_event_items
  on storage.objects;

-- Keep owner listing and deletion for existing workflows, but disallow object
-- downloads and signed-URL creation through the owner browser session.
drop policy if exists my_journal_storage_select_owner on storage.objects;
create policy my_journal_storage_select_owner
on storage.objects for select to authenticated
using (
  bucket_id = 'journal-private'
  and storage.allow_any_operation(array[
    'object.list',
    'object.delete',
    'object.delete_many',
    'object.upload_update'
  ])
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select private.is_journal_owner())
);

-- Keep authenticated owner access through the owner-only permissive policy.
-- This restrictive guard also blocks any later permissive policy from
-- granting anonymous or non-owner access to this private bucket.
drop policy if exists my_journal_storage_guard_select on storage.objects;
create policy my_journal_storage_guard_select
on storage.objects as restrictive for select to public
using (
  bucket_id <> 'journal-private'
  or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_journal_owner())
  )
);

comment on policy my_journal_storage_guard_select on storage.objects is
  'Restricts journal-private Storage reads to the configured owner. Public image bytes are served by application routes that recheck current visibility.';

commit;
