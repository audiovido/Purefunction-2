-- Messages between the coach and each client. Additive only.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  from_coach boolean not null,
  body text not null default '' check (char_length(body) <= 4000),
  attachment_path text,
  attachment_type text check (attachment_type in ('image', 'video')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_client_created_idx on public.messages (client_id, created_at);

alter table public.messages enable row level security;

-- coach: everything; client: only their own thread
create policy "messages read" on public.messages for select to authenticated
  using ((select private.is_coach()) or client_id = (select private.my_client_id()));
create policy "messages insert" on public.messages for insert to authenticated
  with check (
    ((select private.is_coach()) and from_coach)
    or (client_id = (select private.my_client_id()) and not from_coach)
  );
-- mark as read: the receiving side only
create policy "messages update" on public.messages for update to authenticated
  using (((select private.is_coach()) and not from_coach) or (client_id = (select private.my_client_id()) and from_coach))
  with check (((select private.is_coach()) and not from_coach) or (client_id = (select private.my_client_id()) and from_coach));

-- only read_at may change
create function private.guard_message_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.body is distinct from old.body or new.client_id is distinct from old.client_id
     or new.from_coach is distinct from old.from_coach or new.attachment_path is distinct from old.attachment_path then
    raise exception 'Messages cannot be edited';
  end if;
  return new;
end;
$$;
create trigger messages_guard before update on public.messages
  for each row execute function private.guard_message_update();

alter publication supabase_realtime add table public.messages;

-- Private bucket for photos/videos in chat: path = <client_id>/<file>
insert into storage.buckets (id, name, public, file_size_limit)
values ('message-media', 'message-media', false, 52428800)
on conflict (id) do nothing;

create policy "message media read" on storage.objects for select to authenticated
  using (bucket_id = 'message-media' and ((select private.is_coach()) or (storage.foldername(name))[1] = (select private.my_client_id())));
create policy "message media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'message-media' and ((select private.is_coach()) or (storage.foldername(name))[1] = (select private.my_client_id())));
