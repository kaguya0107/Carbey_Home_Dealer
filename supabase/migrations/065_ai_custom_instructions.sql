-- Carbey Portal — AIプロンプト入力（加盟者ごとの「AIへの指示」）
--
-- 背景（検収 修正確認 ⑫/⑭）：本部側・加盟者側それぞれで、AIの回答方針を自由に入力（学習・カスタム）
--   できる仕様が望ましい。加盟者は「自分の好みに沿った形式」を指示として保存し、以降のAI相談へ反映する。
--   本部AI側の指示は portal.editable_notes（key='hq_ai_instructions'）で保持するため、ここでは加盟者用の列を追加。
--
-- この列は各加盟者が自分で編集する自由記述のプロンプト。system prompt の末尾に追記される。

alter table portal.members
  add column if not exists ai_custom_instructions text;

comment on column portal.members.ai_custom_instructions is '加盟者がAI相談の回答方針として自由入力する指示（プロンプト）。system prompt 末尾へ追記。null/空=未設定。';
