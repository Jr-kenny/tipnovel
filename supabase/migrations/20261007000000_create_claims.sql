create table if not exists claims (
  id text primary key,
  author_name text not null,
  author_id text not null,
  origin_platform text not null default '',
  origin_username text not null default '',
  origin_url text not null default '',
  evidence jsonb not null default '[]',
  message text not null default '',
  email text not null default '',
  payout_wallet text not null default '',
  balance_at_submit text not null default '0',
  status text not null default 'pending',
  questions jsonb not null default '[]',
  followups jsonb not null default '[]',
  detail_tokens jsonb not null default '[]',
  approve_tx text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table claims enable row level security;

insert into storage.buckets (id, name, public)
values ('claim-evidence', 'claim-evidence', false)
on conflict (id) do nothing;
