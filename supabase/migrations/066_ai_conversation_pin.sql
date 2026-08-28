-- Carbey Portal — AI会話のピン留め（⑰）
--
-- 背景（検収 追加 ⑰）：チャット/AI検索の履歴を残す・消せるに加え、案件ごとに重要な会話を
--   「ピン留め」して保持できるようにする。深掘り・追及のリサーチ導線を支える。
--   pinned_at を立てた会話は一覧の先頭に固定表示する（null=通常）。

alter table portal.ai_conversations
  add column if not exists pinned_at timestamptz;

comment on column portal.ai_conversations.pinned_at is 'ピン留め日時（⑰）。非nullで一覧先頭に固定。null=通常。';

create index if not exists idx_ai_conv_pinned on portal.ai_conversations(pinned_at desc nulls last);
