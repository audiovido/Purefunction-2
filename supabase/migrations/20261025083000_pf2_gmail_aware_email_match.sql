-- Gmail ignores dots and anything after "+" in the name, and googlemail.com = gmail.com.
-- Match client emails that way so armin.sh00@gmail.com finds arminsh00@googlemail.com.
-- (Applied to project pure-function-2 on 2026-10-25.)
create function private.email_key(e text) returns text
language sql immutable set search_path = '' as $$
  select case
    when split_part(lower(trim(e)), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(trim(e)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else lower(trim(e))
  end;
$$;
revoke execute on function private.email_key(text) from public, anon, authenticated;

create or replace function public.signup_role(p_email text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from private.settings s where s.key = 'coach_email' and private.email_key(s.value) = private.email_key(p_email)) then 'coach'
    when exists (select 1 from public.clients c where c.email <> '' and private.email_key(c.email) = private.email_key(p_email)) then 'client'
    else null
  end;
$$;
revoke execute on function public.signup_role(text) from public, anon, authenticated;
grant execute on function public.signup_role(text) to service_role;

create or replace function private.link_user(uid uuid, user_email text, user_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  coach_email text;
  cid text;
  cname text;
begin
  if exists (select 1 from public.profiles where id = uid) then
    return;
  end if;
  select value into coach_email from private.settings where key = 'coach_email';
  if coach_email is not null and private.email_key(user_email) = private.email_key(coach_email) then
    insert into public.profiles (id, role, display_name)
    values (uid, 'coach', coalesce(nullif(user_name, ''), split_part(user_email, '@', 1)));
    return;
  end if;
  select c.id, c.data->>'name' into cid, cname
  from public.clients c
  where c.email <> '' and private.email_key(c.email) = private.email_key(user_email)
  limit 1;
  if cid is not null then
    insert into public.profiles (id, role, display_name, client_id)
    values (uid, 'client', coalesce(cname, split_part(user_email, '@', 1)), cid);
  end if;
end;
$$;

create or replace function private.on_client_email_set() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  u record;
begin
  if new.email <> '' then
    for u in select id, email from auth.users where private.email_key(email) = private.email_key(new.email) loop
      perform private.link_user(u.id, u.email, null);
    end loop;
  end if;
  return new;
end;
$$;
revoke execute on function private.link_user(uuid, text, text), private.on_client_email_set() from public, anon, authenticated;
