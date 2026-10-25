-- Permit short-lived public image URLs only for objects referenced by image
-- metadata that the current role can read under public.post_images RLS.
-- Existing owner-only write/update/delete policies remain unchanged.

begin;

create policy my_journal_storage_select_readable_post_images
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'journal-private'
  and exists (
    select 1
    from public.post_images as image
    where image.storage_path = objects.name
  )
);

-- Keep the existing restrictive guard, while allowing the same RLS-filtered
-- public image references through. Private/unpublished post rows remain
-- invisible to anon because post_images and posts both enforce RLS.
drop policy my_journal_storage_guard_select on storage.objects;
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
  )
);

commit;
