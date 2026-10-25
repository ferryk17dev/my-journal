-- Restrict public post-image metadata to the posts-only Storage namespace.
-- Add the CHECK as NOT VALID so legacy rows do not block the migration;
-- new and updated metadata must conform immediately.

begin;

alter table public.post_images
  add constraint post_images_storage_path_namespace
  check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/posts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
  ) not valid;

-- Bind newly inserted/updated metadata paths to the authenticated owner and
-- posts namespace. Keep UPDATE's USING clause unchanged so legacy invalid rows
-- remain visible to the owner and can be repaired or deleted.
drop policy post_images_insert_owner on public.post_images;
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
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
  and split_part(storage_path, '/', 2) = 'posts'
);

drop policy post_images_update_owner on public.post_images;
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
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
  and split_part(storage_path, '/', 2) = 'posts'
);

-- Public image delivery must require both visible image metadata and the
-- posts-only namespace. This also protects legacy rows not yet validated by
-- the NOT VALID constraint.
drop policy my_journal_storage_select_readable_post_images on storage.objects;
create policy my_journal_storage_select_readable_post_images
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'journal-private'
  and exists (
    select 1
    from public.post_images as image
    where image.storage_path = objects.name
      and image.storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/posts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
  )
);

-- Preserve owner access and deny cross-namespace metadata references even if
-- another permissive Storage policy is added later.
drop policy my_journal_storage_guard_select on storage.objects;
create policy my_journal_storage_guard_select
on storage.objects as restrictive for select to public
using (
  bucket_id <> 'journal-private'
  or (
    (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_journal_owner())
  )
  or (
    bucket_id = 'journal-private'
    and exists (
      select 1
      from public.post_images as image
      where image.storage_path = objects.name
        and image.storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/posts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
    )
  )
);

commit;
