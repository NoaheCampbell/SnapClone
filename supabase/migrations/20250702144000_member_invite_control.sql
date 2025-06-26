-- Migration: allow owners to control member invite permissions

alter table if exists public.circles
  add column if not exists allow_member_invites boolean not null default true; 