-- v3 (Amendments §14): WhatsApp-driven hunts + autopilot tick locking.
-- Re-runnable.

alter table briefs
  add column if not exists tick_lock_until timestamptz;

alter table briefs
  add column if not exists source text not null default 'web';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'briefs_source_check'
  ) then
    alter table briefs
      add constraint briefs_source_check check (source in ('web', 'whatsapp'));
  end if;
end $$;
