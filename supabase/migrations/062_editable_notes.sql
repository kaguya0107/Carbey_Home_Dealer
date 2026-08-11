-- Carbey Portal — P4: 本部が自由編集できる注意書き（掲示文）
--
-- 背景（クライアント要望 #6）：AI相談ページ等に出す「注意書き／ご案内」を、コード改修なしで
--   本部（運営）が画面から自由に編集できるようにする。key で参照する単純な掲示文ストア。
--   ・加盟店にも表示するため、ログイン中ユーザーは閲覧可。編集は本部スタッフのみ。
--   詳細は docs/member-snapshot-onboarding-design.md（D. 注意書き）。

create table if not exists portal.editable_notes (
  key        text primary key,
  title      text,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references portal.users(id) on delete set null
);

comment on table portal.editable_notes is '本部が自由編集できる掲示文（加盟店AIページの注意書き等）。key で参照。';
comment on column portal.editable_notes.key is '掲示箇所を識別するキー（例：member_ai_notice）。';

alter table portal.editable_notes enable row level security;

-- 閲覧：ログイン中ユーザー（本部・加盟店とも）。掲示文は加盟店にも表示するため。
drop policy if exists editable_notes_read on portal.editable_notes;
create policy editable_notes_read on portal.editable_notes
  for select using (auth.uid() is not null);

-- 編集：本部スタッフのみ。
drop policy if exists editable_notes_write on portal.editable_notes;
create policy editable_notes_write on portal.editable_notes
  for all using (portal.is_staff(auth.uid())) with check (portal.is_staff(auth.uid()));

-- 既定の注意書きを1件シード（本部が後から自由に編集できる）。
insert into portal.editable_notes(key, title, body) values
  (
    'member_ai_notice',
    'ご利用にあたって',
    'AIの回答は、カーセンサーの市場データと一般的な業界知識に基づく参考情報です。最終的な仕入れ・値付け・税務・法務の判断は、必ずご自身と専門家のご確認のうえ行ってください。市場データは直近30日の収集分を対象としています。'
  )
on conflict (key) do nothing;
