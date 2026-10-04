create table if not exists public.authority_users (
    user_id uuid primary key references auth.users (id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.authority_users enable row level security;

create or replace function public.is_authority()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.authority_users
        where user_id = (select auth.uid())
    );
$$;

revoke all on function public.is_authority() from public;
grant execute on function public.is_authority() to authenticated;

create table if not exists public.complaints (
    id uuid primary key,
    role text not null check (role in ('Student', 'Faculty', 'Non-Faculty')),
    name text not null,
    identifier text not null,
    department text not null,
    semester text,
    class_name text,
    designation text,
    phone text not null,
    category text not null,
    description text not null,
    image_path text,
    status text not null default 'Pending'
        check (status in ('Pending', 'In Progress', 'Resolved')),
    authority_remarks text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.complaint_feedback (
    id uuid primary key default gen_random_uuid(),
    complaint_id uuid not null references public.complaints (id) on delete cascade,
    rating text not null,
    comment text,
    created_at timestamptz not null default now()
);

create index if not exists complaint_feedback_complaint_id_idx
on public.complaint_feedback (complaint_id);

create index if not exists complaints_created_at_idx
on public.complaints (created_at desc);

alter table public.complaints enable row level security;
alter table public.complaint_feedback enable row level security;

drop policy if exists "Authorities can read complaint feedback" on public.complaint_feedback;

drop policy if exists "Anyone can submit complaint feedback" on public.complaint_feedback;

create policy "Anyone can submit complaint feedback"
on public.complaint_feedback
for insert
to anon, authenticated
with check (true);

create policy "Anyone can read complaint feedback"
on public.complaint_feedback
for select
to anon, authenticated
using (true);

create policy "Anyone can submit a complaint"
on public.complaints
for insert
to anon, authenticated
with check (true);

create policy "Authorities can read complaints"
on public.complaints
for select
to authenticated
using (public.is_authority());

create policy "Authorities can update complaints"
on public.complaints
for update
to authenticated
using (public.is_authority())
with check (public.is_authority());

create or replace function public.track_complaint(complaint_id_input uuid)
returns table (
    complaint_id uuid,
    category text,
    status text,
    submitted_at timestamptz,
    updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select c.id, c.category, c.status, c.created_at, c.updated_at
    from public.complaints as c
    where c.id = complaint_id_input
    limit 1;
$$;

revoke all on function public.track_complaint(uuid) from public;
grant execute on function public.track_complaint(uuid) to anon, authenticated;

create or replace function public.list_resolved_complaints()
returns table (
    complaint_id uuid,
    role text,
    name text,
    identifier text,
    department text,
    semester text,
    class_name text,
    designation text,
    phone text,
    category text,
    description text,
    status text,
    authority_remarks text,
    submitted_at timestamptz,
    updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select
        c.id,
        c.role,
        c.name,
        c.identifier,
        c.department,
        c.semester,
        c.class_name,
        c.designation,
        c.phone,
        c.category,
        c.description,
        c.status,
        c.authority_remarks,
        c.created_at,
        c.updated_at
    from public.complaints as c
    where c.status = 'Resolved'
    order by c.created_at desc;
$$;

revoke all on function public.list_resolved_complaints() from public;
grant execute on function public.list_resolved_complaints() to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-evidence', 'complaint-evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Anyone can upload complaint evidence"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'complaint-evidence');

create policy "Authorities can view complaint evidence"
on storage.objects
for select
to authenticated
using (bucket_id = 'complaint-evidence' and public.is_authority());
