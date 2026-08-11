-- Carbey Portal — Phase 4 AI: 会話・メッセージの永続化
--
-- 背景：
--   加盟店AI／本部AIの会話履歴を保存する。会話・読み込んだデータの蓄積が回答品質向上の基礎になる。
--   ・scope='member' … 加盟店AI（member_id 必須・自社スコープ）
--   ・scope='hq'     … 本部AI（member_id は null・本部スタッフ）
--   分析サイトの conversationRepo を移植し、加盟者スコープ（RLS）で再実装する土台。

create table if not exists portal.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  scope      text not null check (scope in ('member','hq')),
  member_id  uuid references portal.members(id) on delete cascade,  -- scope='member' で必須、hq は null
  title      text,
  created_by uuid,                                                  -- portal.users.id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ai_conv_member on portal.ai_conversations(member_id);
create index if not exists idx_ai_conv_scope  on portal.ai_conversations(scope, created_at);

create table if not exists portal.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references portal.ai_conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system','tool')),
  content         jsonb not null,        -- テキスト/ツール結果/添付参照など
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  created_at      timestamptz not null default now()
);
create index if not exists idx_ai_msg_conv on portal.ai_messages(conversation_id, created_at);

-- RLS：加盟店は自分の会話のみ、本部スタッフは全件。書き込みは service_role（サーバー）経由。
alter table portal.ai_conversations enable row level security;
drop policy if exists ai_conv_read on portal.ai_conversations;
create policy ai_conv_read on portal.ai_conversations
  for select using (portal.is_staff(auth.uid()) or member_id = portal.current_member_id(auth.uid()));

alter table portal.ai_messages enable row level security;
drop policy if exists ai_msg_read on portal.ai_messages;
create policy ai_msg_read on portal.ai_messages
  for select using (exists (
    select 1 from portal.ai_conversations c
     where c.id = conversation_id
       and (portal.is_staff(auth.uid()) or c.member_id = portal.current_member_id(auth.uid()))
  ));
