-- Give every barbershop its own public profile, services, hours and appointments.
begin;

create table public.barbershops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  whatsapp text not null default '',
  instagram_url text not null default '',
  address text not null default '',
  city text not null default '',
  state text not null default '',
  about text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.barber_shop_members (
  shop_id uuid not null references public.barbershops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'manager', 'barber')),
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);

alter table public.services add column shop_id uuid;
alter table public.bookings add column shop_id uuid;
alter table public.business_hours add column shop_id uuid references public.barbershops(id) on delete cascade;

do $$
declare
  default_shop_id uuid;
  owner_id uuid;
begin
  select user_id into owner_id from public.barber_admins order by created_at limit 1;
  if owner_id is null then
    raise exception 'A barbershop owner must exist in public.barber_admins before enabling multi-tenant data.';
  end if;

  insert into public.barbershops (name, slug, created_by)
  values ('barbearia-eight-sigma', 'barbearia-eight-sigma', owner_id)
  returning id into default_shop_id;

  insert into public.barber_shop_members (shop_id, user_id, role)
  select default_shop_id, user_id, 'owner' from public.barber_admins
  on conflict do nothing;

  update public.services set shop_id = default_shop_id where shop_id is null;
  update public.bookings set shop_id = default_shop_id where shop_id is null;
  update public.business_hours set shop_id = default_shop_id where shop_id is null;
end $$;

alter table public.services alter column shop_id set not null;
alter table public.services add constraint services_shop_id_fkey foreign key (shop_id) references public.barbershops(id) on delete cascade;
alter table public.services add constraint services_shop_id_id_key unique (shop_id, id);

alter table public.bookings alter column shop_id set not null;
alter table public.bookings drop constraint if exists bookings_service_id_fkey;
alter table public.bookings add constraint bookings_service_shop_fkey foreign key (shop_id, service_id) references public.services(shop_id, id) on delete restrict;

alter table public.business_hours alter column shop_id set not null;
alter table public.business_hours drop constraint if exists business_hours_id_check;
alter table public.business_hours drop constraint if exists business_hours_pkey;
alter table public.business_hours alter column id drop default;
alter table public.business_hours alter column id type uuid using gen_random_uuid();
alter table public.business_hours alter column id set default gen_random_uuid();
alter table public.business_hours add constraint business_hours_pkey primary key (id);
alter table public.business_hours add constraint business_hours_shop_id_key unique (shop_id);

create index services_shop_active_idx on public.services(shop_id, active, name);
create index bookings_shop_date_idx on public.bookings(shop_id, booking_date, start_time);

alter table public.barbershops enable row level security;
alter table public.barber_shop_members enable row level security;

grant select, insert, update on public.barbershops to authenticated;
grant select on public.barbershops to anon;
grant select, insert on public.barber_shop_members to authenticated;
grant select on public.barber_shop_members to anon;
grant select, insert, update on public.business_hours to authenticated;
grant select on public.business_hours to anon;
grant select, insert, update, delete on public.services to authenticated;
grant select on public.services to anon;
grant select, insert, update on public.bookings to authenticated;
grant insert on public.bookings to anon;

create policy "public can read active barbershops" on public.barbershops
  for select to anon, authenticated
  using (active or created_by = (select auth.uid()));
create policy "shop owners can create their own profile" on public.barbershops
  for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "shop owners can update their profile" on public.barbershops
  for update to authenticated
  using (exists (
    select 1 from public.barber_shop_members m
    where m.shop_id = barbershops.id and m.user_id = (select auth.uid()) and m.role = 'owner'
  ))
  with check (created_by = (select auth.uid()));

create policy "users can view their own shop memberships" on public.barber_shop_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy "shop creators can add themselves as owner" on public.barber_shop_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and role = 'owner'
    and exists (
      select 1 from public.barbershops b
      where b.id = barber_shop_members.shop_id and b.created_by = (select auth.uid())
    )
  );

drop policy if exists "barber admins can view all services" on public.services;
drop policy if exists "barber admins can add services" on public.services;
drop policy if exists "barber admins can edit services" on public.services;
drop policy if exists "barber admins can delete services" on public.services;
drop policy if exists "public can view active services" on public.services;

create policy "public can view services of active shops" on public.services
  for select to anon, authenticated
  using (
    active and exists (select 1 from public.barbershops b where b.id = services.shop_id and b.active)
    or exists (
      select 1 from public.barber_shop_members m
      where m.shop_id = services.shop_id and m.user_id = (select auth.uid())
    )
  );
create policy "shop members can add services" on public.services
  for insert to authenticated
  with check (exists (
    select 1 from public.barber_shop_members m
    where m.shop_id = services.shop_id and m.user_id = (select auth.uid())
  ));
create policy "shop members can edit services" on public.services
  for update to authenticated
  using (exists (
    select 1 from public.barber_shop_members m
    where m.shop_id = services.shop_id and m.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.barber_shop_members m
    where m.shop_id = services.shop_id and m.user_id = (select auth.uid())
  ));
create policy "shop members can delete services" on public.services
  for delete to authenticated
  using (exists (
    select 1 from public.barber_shop_members m
    where m.shop_id = services.shop_id and m.user_id = (select auth.uid())
  ));

drop policy if exists "barber admins can view bookings" on public.bookings;
drop policy if exists "barber admins can update bookings" on public.bookings;
drop policy if exists "public can view occupied schedule without client details" on public.bookings;
drop policy if exists "visitors can request appointments" on public.bookings;

create policy "shop members can view bookings" on public.bookings
  for select to authenticated
  using (exists (
    select 1 from public.barber_shop_members m
    where m.shop_id = bookings.shop_id and m.user_id = (select auth.uid())
  ));
create policy "shop members can update bookings" on public.bookings
  for update to authenticated
  using (exists (
    select 1 from public.barber_shop_members m
    where m.shop_id = bookings.shop_id and m.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.barber_shop_members m
    where m.shop_id = bookings.shop_id and m.user_id = (select auth.uid())
  ));
create policy "public can view occupied slots for active shops" on public.bookings
  for select to anon
  using (
    status in ('pending', 'confirmed')
    and exists (select 1 from public.barbershops b where b.id = bookings.shop_id and b.active)
  );
create policy "visitors can request appointments at active shops" on public.bookings
  for insert to anon, authenticated
  with check (
    status = 'pending'
    and exists (select 1 from public.barbershops b where b.id = bookings.shop_id and b.active)
  );

revoke select on public.bookings from public, anon;
grant select (id, shop_id, service_id, booking_date, start_time, start_minute, duration_minutes, status) on public.bookings to anon;
grant select on public.bookings to authenticated;

drop policy if exists "barber admins can update business hours" on public.business_hours;
drop policy if exists "public can read business hours" on public.business_hours;
create policy "public can read hours of active shops" on public.business_hours
  for select to anon, authenticated
  using (exists (select 1 from public.barbershops b where b.id = business_hours.shop_id and b.active));
create policy "shop members can update business hours" on public.business_hours
  for update to authenticated
  using (exists (
    select 1 from public.barber_shop_members m
    where m.shop_id = business_hours.shop_id and m.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.barber_shop_members m
    where m.shop_id = business_hours.shop_id and m.user_id = (select auth.uid())
  ));
create policy "shop owners can add business hours" on public.business_hours
  for insert to authenticated
  with check (exists (
    select 1 from public.barber_shop_members m
    where m.shop_id = business_hours.shop_id and m.user_id = (select auth.uid())
  ));

commit;
