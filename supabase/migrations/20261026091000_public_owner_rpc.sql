-- Expose only the owner predicate through the public Data API schema.
-- The private owner registry remains unexposed and inaccessible to API roles.

begin;

create function public.is_journal_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_journal_owner();
$$;

revoke all on function public.is_journal_owner() from public, anon, authenticated;
grant execute on function public.is_journal_owner() to authenticated;

comment on function public.is_journal_owner() is
  'Returns whether auth.uid() is the configured journal owner; does not expose owner registry data.';

commit;
