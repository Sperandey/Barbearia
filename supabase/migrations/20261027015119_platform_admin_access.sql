-- Let platform administrators manage every shop while each shop keeps its own login.
begin;

create or replace function public.is_barber_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.barber_admins a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_barber_platform_admin() from public;
grant execute on function public.is_barber_platform_admin() to authenticated;

create policy "platform admins can read every barbershop"
  on public.barbershops for select to authenticated
  using (public.is_barber_platform_admin());
create policy "platform admins can update every barbershop"
  on public.barbershops for update to authenticated
  using (public.is_barber_platform_admin())
  with check (public.is_barber_platform_admin());

create policy "platform admins can manage every service"
  on public.services for all to authenticated
  using (public.is_barber_platform_admin())
  with check (public.is_barber_platform_admin());

create policy "platform admins can manage every booking"
  on public.bookings for all to authenticated
  using (public.is_barber_platform_admin())
  with check (public.is_barber_platform_admin());

create policy "platform admins can manage every schedule"
  on public.business_hours for all to authenticated
  using (public.is_barber_platform_admin())
  with check (public.is_barber_platform_admin());

commit;
