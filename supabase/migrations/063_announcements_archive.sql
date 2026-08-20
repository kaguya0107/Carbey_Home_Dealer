-- Carbey Portal — お知らせのアーカイブ（ソフト削除）：配信済みの内容を保全
--
-- 背景（検収 修正確認 ⑤）：配信済みお知らせは物理削除すると内容が失われる。
--   証跡・保全のため物理削除をやめ、archived_at を立てるソフト削除（アーカイブ）に切り替える。
--   一覧では「有効（archived_at=null）」と「アーカイブ済み（内容保全）」を分けて可視化する。

alter table portal.announcements
  add column if not exists archived_at timestamptz;

comment on column portal.announcements.archived_at is 'アーカイブ日時（ソフト削除）。内容保全のため物理削除せずここを立てる。null=有効。';
