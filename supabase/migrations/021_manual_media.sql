-- =====================================================================
-- Carbey Portal — レビュー㉜ STEP4: 実践マニュアルに動画・添付データ
-- =====================================================================
-- クライアント要件（㉜ ステップ4）:
--   トレーニング（実践マニュアル）の各項目に、動画やマニュアルデータを
--   埋め込めるようにする。本部が項目を追加・編集でき、加盟店は閲覧して
--   チェックすると自動で次へ進める。
--
--   - video_url        : 動画URL（YouTube/Vimeo 等の埋め込み再生）
--   - attachment_path  : 添付ファイル（PDF等）の Storage パス
--   - attachment_name  : 添付ファイルの表示名
--
-- 添付は public バケット manual-media に保存（研修資料は全加盟店が閲覧する
-- 教材のため。本人確認書類のような機微情報ではない）。
-- 冪等化のため if not exists / on conflict を併用。
-- =====================================================================

alter table portal.manual_sections add column if not exists video_url text;
alter table portal.manual_sections add column if not exists attachment_path text;
alter table portal.manual_sections add column if not exists attachment_name text;

comment on column portal.manual_sections.video_url is 'マニュアル動画URL（YouTube/Vimeo等・埋め込み再生）';
comment on column portal.manual_sections.attachment_path is 'マニュアル添付ファイルの Storage パス（manual-media バケット）';

-- ---------------------------------------------------------------------
-- Storage: public バケット manual-media（研修教材）
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('manual-media', 'manual-media', true)
on conflict (id) do nothing;

-- アップロード/削除は本部（staff）のみ、閲覧は公開（public バケット）
drop policy if exists manual_media_write on storage.objects;
create policy manual_media_write on storage.objects
  for all to authenticated
  using (bucket_id = 'manual-media' and portal.is_staff(auth.uid()))
  with check (bucket_id = 'manual-media' and portal.is_staff(auth.uid()));
