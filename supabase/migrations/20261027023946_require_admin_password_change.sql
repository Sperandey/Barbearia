begin;

alter table public.barber_admins
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_change_required_at timestamptz;

create or replace function public.complete_admin_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.barber_admins admins
  set must_change_password = false,
      password_change_required_at = null
  where admins.user_id = current_user_id
    and admins.must_change_password
    and exists (
      select 1
      from auth.users auth_user
      where auth_user.id = current_user_id
        and auth_user.updated_at > admins.password_change_required_at
    );

  if not found then
    raise exception 'Update the administrator password before completing setup';
  end if;
end;
$$;

revoke all on function public.complete_admin_password_change() from public;
grant execute on function public.complete_admin_password_change() to authenticated;

commit;
