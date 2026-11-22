-- ============================================================
-- Relevamiento Territorial · Esquema Supabase (Postgres + PostGIS)
-- Ejecutar completo en: Supabase > SQL Editor
-- ============================================================
create extension if not exists postgis;

create type rol_usuario  as enum ('super_admin','coordinador','militante');
create type categoria_contacto as enum ('vecino','union_vecinal','club_deportivo','centro_jubilados','comercio_referente');
create type afinidad as enum ('verde','amarillo','rojo');

-- Juntas / circuitos (Trinidad, Concepción, Desamparados, Capital Centro)
create table juntas (
  id serial primary key,
  nombre text not null unique,
  departamento text not null default 'Capital'
);
insert into juntas (nombre) values ('Trinidad'),('Concepción'),('Desamparados'),('Capital Centro');

-- Perfiles (1:1 con auth.users). Se crean SOLO desde la Edge Function admin-create-user.
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol rol_usuario not null default 'militante',
  junta_id int references juntas(id),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Zonas (polígonos asignables dentro de una junta)
create table zonas (
  id uuid primary key default gen_random_uuid(),
  junta_id int not null references juntas(id),
  nombre text not null,
  geom geometry(Polygon, 4326) not null,
  created_at timestamptz not null default now()
);
create index zonas_geom_idx on zonas using gist (geom);

create table asignaciones (
  zona_id uuid references zonas(id) on delete cascade,
  militante_id uuid references perfiles(id) on delete cascade,
  asignado_por uuid references perfiles(id),
  created_at timestamptz not null default now(),
  primary key (zona_id, militante_id)
);

-- Relevamientos. El id lo genera el CLIENTE (uuid) => upsert idempotente = sync offline seguro.
create table relevamientos (
  id uuid primary key,
  militante_id uuid not null references perfiles(id) default auth.uid(),
  zona_id uuid references zonas(id),
  geom geometry(Point, 4326) not null,
  nombre text not null,
  direccion text not null,
  telefono text,
  dni text,
  categoria categoria_contacto not null default 'vecino',
  afinidad afinidad not null,
  observaciones text,
  tags text[] not null default '{}',
  capturado_en timestamptz not null,          -- hora real en el celular
  created_at timestamptz not null default now() -- hora de llegada al servidor
);
create index relev_geom_idx on relevamientos using gist (geom);
create index relev_zona_idx on relevamientos (zona_id);

create table audit_log (
  id bigserial primary key,
  usuario_id uuid,
  accion text not null,
  detalle jsonb,
  ip text,
  dispositivo text,
  ts timestamptz not null default now()
);

-- ---------- Helpers ----------
create or replace function mi_rol() returns rol_usuario
language sql stable security definer set search_path = public as
$$ select rol from perfiles where id = auth.uid() and activo $$;

create or replace function mi_junta() returns int
language sql stable security definer set search_path = public as
$$ select junta_id from perfiles where id = auth.uid() and activo $$;

-- Registro manual de auditoría (exportaciones, etc.) con IP y dispositivo del request
create or replace function log_audit(p_accion text, p_detalle jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare h json := coalesce(current_setting('request.headers', true), '{}')::json;
begin
  insert into audit_log (usuario_id, accion, detalle, ip, dispositivo)
  values (auth.uid(), p_accion, p_detalle,
          split_part(coalesce(h->>'x-forwarded-for',''), ',', 1), h->>'user-agent');
end $$;

-- ---------- Triggers de auditoría ----------
create or replace function trg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_audit(tg_table_name || '.' || lower(tg_op),
    jsonb_build_object('id', coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id'))));
  return coalesce(new, old);
end $$;

create trigger aud_perfiles after insert or update or delete on perfiles for each row execute function trg_audit();
create trigger aud_asign    after insert or delete on asignaciones     for each row execute function trg_audit();
create trigger aud_zonas    after insert or update or delete on zonas  for each row execute function trg_audit();
create trigger aud_relev_del after delete on relevamientos             for each row execute function trg_audit();

-- ---------- RLS ----------
alter table juntas        enable row level security;
alter table perfiles      enable row level security;
alter table zonas         enable row level security;
alter table asignaciones  enable row level security;
alter table relevamientos enable row level security;
alter table audit_log     enable row level security;

create policy juntas_read on juntas for select using (mi_rol() is not null);

create policy perfiles_read on perfiles for select using (
  id = auth.uid() or mi_rol() = 'super_admin'
  or (mi_rol() = 'coordinador' and junta_id = mi_junta()));
create policy perfiles_admin on perfiles for all using (mi_rol() = 'super_admin') with check (mi_rol() = 'super_admin');

create policy zonas_read on zonas for select using (
  mi_rol() = 'super_admin'
  or (mi_rol() = 'coordinador' and junta_id = mi_junta())
  or exists (select 1 from asignaciones a where a.zona_id = zonas.id and a.militante_id = auth.uid()));
create policy zonas_write on zonas for all
  using (mi_rol() = 'super_admin' or (mi_rol() = 'coordinador' and junta_id = mi_junta()))
  with check (mi_rol() = 'super_admin' or (mi_rol() = 'coordinador' and junta_id = mi_junta()));

create policy asign_read on asignaciones for select using (
  militante_id = auth.uid() or mi_rol() = 'super_admin'
  or (mi_rol() = 'coordinador' and exists (select 1 from zonas z where z.id = zona_id and z.junta_id = mi_junta())));
create policy asign_write on asignaciones for all
  using (mi_rol() = 'super_admin' or (mi_rol() = 'coordinador' and exists (select 1 from zonas z where z.id = zona_id and z.junta_id = mi_junta())))
  with check (mi_rol() = 'super_admin' or (mi_rol() = 'coordinador' and exists (select 1 from zonas z where z.id = zona_id and z.junta_id = mi_junta())));

-- Relevamientos: el militante ve/edita SOLO los suyos y SOLO dentro de una zona asignada.
create policy relev_read on relevamientos for select using (
  militante_id = auth.uid() or mi_rol() = 'super_admin'
  or (mi_rol() = 'coordinador' and exists (select 1 from zonas z where z.id = zona_id and z.junta_id = mi_junta())));
create policy relev_insert on relevamientos for insert with check (
  militante_id = auth.uid() and exists (
    select 1 from asignaciones a join zonas z on z.id = a.zona_id
    where a.militante_id = auth.uid() and z.id = zona_id and st_contains(z.geom, geom)));
create policy relev_update on relevamientos for update using (militante_id = auth.uid());
create policy relev_delete on relevamientos for delete using (
  mi_rol() = 'super_admin' or (mi_rol() = 'coordinador' and exists (select 1 from zonas z where z.id = zona_id and z.junta_id = mi_junta())));

create policy audit_read on audit_log for select using (mi_rol() = 'super_admin');
-- audit_log: sin policies de insert/update/delete => nadie la modifica desde el cliente.

-- ---------- Vistas / RPC ----------
-- Zonas en GeoJSON (respeta RLS del usuario que consulta)
create view zonas_geojson with (security_invoker = true) as
  select id, junta_id, nombre, st_asgeojson(geom)::jsonb as geojson from zonas;

-- Insert que recibe lat/lng (más simple desde el cliente que mandar WKT)
create or replace function upsert_relevamiento(r jsonb) returns void
language plpgsql security invoker as $$
begin
  insert into relevamientos (id, zona_id, geom, nombre, direccion, telefono, dni, categoria, afinidad, observaciones, tags, capturado_en)
  values ((r->>'id')::uuid, (r->>'zona_id')::uuid,
          st_setsrid(st_makepoint((r->>'lng')::float, (r->>'lat')::float), 4326),
          r->>'nombre', r->>'direccion', nullif(r->>'telefono',''), nullif(r->>'dni',''),
          (r->>'categoria')::categoria_contacto, (r->>'afinidad')::afinidad, r->>'observaciones',
          coalesce(array(select jsonb_array_elements_text(r->'tags')), '{}'), (r->>'capturado_en')::timestamptz)
  on conflict (id) do update set
    nombre = excluded.nombre, direccion = excluded.direccion, telefono = excluded.telefono, dni = excluded.dni,
    categoria = excluded.categoria, afinidad = excluded.afinidad, observaciones = excluded.observaciones, tags = excluded.tags;
end $$;

-- Primer Super Admin: crear el usuario en Auth > Users y luego:
-- insert into perfiles (id, nombre, rol) values ('UUID-DEL-USUARIO', 'Tu nombre', 'super_admin');
