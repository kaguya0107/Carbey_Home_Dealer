# AUTO EXPORT／オート輸出 追加開発 技術分析

対象：クライアント相談書「カーベイHD AUTO EXPORT 追加開発 相談書（2026-08-12）」への開発側分析。
位置づけ：確定仕様ではなく、既存カーベイHD実装を踏まえた実現方式・流用範囲・リスク・MVPの整理。

## 0. 総評
- 本モジュールの骨格（案件→ENTRY→資金予約→輸出→精算）は、**既存カーベイHDの資産で6〜7割を流用可能**。
- 新規の核は次の4点：**①案件/コンテナ/ガジェットの状態機械**、**②EXPORT PARTNER（外部・外国人）ロールとデータ隔離**、**③モジュール横断の資金予約（AVAILABLE判定）**、**④多言語**。
- 最重要の設計勘所：**預かり金は加盟者ごとに“単一プール”**。輸出ENTRYの資金判定は、輸出以外（自動売買・半自動・仕入中案件）のコミットも差し引いた実残で行う必要がある。ここを外すとモジュール間で資金の二重利用が発生する。

## 1. 既存資産マッピング（相談書 #13 流用可否／#14 新規範囲）

| 相談書の要素 | 既存カーベイHD資産 | 判定 |
|---|---|---|
| 加盟者・アカウント | `members` / `users`（role=admin/member/crm_staff/chat_only） | 流用＋ロール追加 |
| 預かり金 TOTAL・入出金履歴 | `member_ledger.balance_yen` ＋ `ledger_entries`（append-only・トリガ再計算） | 流用＋種別追加 |
| RESERVED / AVAILABLE | 現状 `member_budget_alloc`＋`auto_reservations`（自動売買の“予算配分”＝ソフト） | **拡張が必要** |
| ENTRY の原子確保＋資金予約 | `ai_reserve_search`（migration 061・行ロック原子消費 plpgsql）の手法 | 手法流用 |
| 案件/募集/オーダー | `orders`（半自動オーダー管理）・進捗管理 | 参考流用 |
| ガジェット単位の損益・精算 | `vehicle_deals` ＋ `deal_costs` ＋ resyncDealFinancials ＋ `deleted_deals` | **精算エンジン流用** |
| 費用項目（原価/オークション/輸送/港湾等） | `deal_costs`・陸送費マスタ（`shipping_rates`/`system_settings`） | 流用/拡張 |
| 権限キー ON/OFF | `role_permissions`（本部が画面編集・migration 057）＋ `plans/members.feature_*` | 流用 |
| 対象加盟者だけ通知 | `notifications`（audience）＋ チャット | 流用 |
| 操作ログ | `audit_logs` | 流用 |
| 出金ロック等 | `withdrawal_requests`（オーダー中/仕入中ロック） | 参考流用 |
| 輸出案件/コンテナ/ガジェット本体 | なし | **新規** |
| EXPORT PARTNER（外部）ロール | なし | **新規** |
| 多言語（JP/EN/現地語） | 実質JP固定 | **新規** |
| 船UI/コンテナUI演出 | なし | 新規（演出。本体は状態機械） |

## 2. 中核の技術設計

### 2-1. 資金モデル TOTAL/RESERVED/USED/AVAILABLE（#17/#18）
- **TOTAL** = 既存 `member_ledger.balance_yen`（`ledger_entries` から再計算）。真実源はここに一本化。
- **予約**は新設 `fund_reservations`（member_id, ref_type, ref_id=gadget, amount_yen, status=active/released/consumed）で表現。
- **AVAILABLE = balance − Σ(active予約：輸出＋自動売買＋半自動) − Σ(仕入中の未精算コミット)**。
  - → **横断的な「予約集約ビュー」を1つ作り、全モジュールが同じAVAILABLEを見る**構成にする（後述リスク1）。
- 入金反映：既存どおり**本部が入金確認→`ledger_entries`(deposit)追加→残高トリガ→予約差引で即AVAILABLE再計算**（相談書#18と一致）。

### 2-2. ENTRY の排他制御と原子性（#15/#16）— 実装可能
既存 `ai_reserve_search` と同型の plpgsql 関数 `export_entry_reserve(p_gadget uuid, p_member uuid)`：
1. `SELECT … FROM export_gadgets WHERE id=p_gadget FOR UPDATE`（行ロック＝直列化）
2. status=OPEN 判定 ＋ 当該加盟者 AVAILABLE ≥ 必要資金 判定
3. 同一Txで gadget→RESERVED＋member_id 設定 ＆ `fund_reservations` 予約INSERT
4. 不足/競合は例外→ロールバック
- **DB制約でも1ガジェット1加盟者を保証**：`export_gadgets` に「status∈(reserved,filled) の行で member_id 一意」の**部分ユニークインデックス**。画面制御だけに依存しない（#13安全設計）。
- 同時ENTRYはFOR UPDATEで1名だけ成立。

### 2-3. 精算・出納反映（#22/#23）— 既存モデル流用
- 「1ガジェット＝1独立精算」は、既存の**案件単位の損益整合モデル**（費用→損益→預かり金相殺→ロイヤリティ→出納、resyncで再整合）とほぼ同型。
- 精算確定 → `ledger_entries`(kind=settlement) で相殺 → gadget=SETTLED＋**ロック**。
- 修正は**上書きせず取消・再精算を履歴化**（`deleted_deals` 相当＋`audit_logs`）。既存の「差戻し/取消でも金額整合を保つ」設計を必ず踏襲。

### 2-4. ロール・権限（#19/#20）
- 新ロール：**EXPORT_PARTNER（必須・外部/多言語/データ隔離）**。EXPORT_ADMIN は「新ロール」でも「admin＋輸出権限付与」でも可（後者が低工数）。
- 権限キー AUTO_EXPORT_ACCESS / EXPORT_PROJECT_ENTRY / EXPORT_VEHICLE_SELECT は**既存 `role_permissions` ＋ 加盟者フラグ**へ載せる。
- **EXPORT_VEHICLE_SELECT（有料解放）は `feature_ai` と同じ加盟者フラグ方式で最小工数**（初期は入金確認後に本部が手動ON、将来決済連動）。
- 車両検索・選択画面は**既存の在庫/市場検索を流用**し、条件内候補提示＋本部最終承認。

### 2-5. 多言語（#24）
- MVPは**輸出パートナー画面を中心にJP/ENの2言語**を、翻訳ファイル/テーブルで外出し。現地語は器のみ用意し後追加。
- 既存JP画面全面のi18n化は範囲を絞る（AUTO EXPORT配下＋パートナー導線に限定）。

### 2-6. UI遷移 コンテナ→船（#21）
- 案件ステータス駆動で同一画面をモード切替（受発注＝コンテナUI／EXPORTING＝船UI）。
- 演出は後回し可。本体は状態機械：DRAFT→OPEN→RESERVED→FILLED→PURCHASED→EXPORTING→ARRIVED→COMPLETED→SETTLED／CANCELLED。

## 3. 新規で必要なもの（概算）
- **テーブル**：`export_projects`（案件/コンテナ）、`export_gadgets`（1台=1加盟者・状態・必要資金・車両・精算コンテキスト）、`fund_reservations`（横断予約）、（必要に応じ）`export_settlements` または既存 `deal_costs` へ寄せる、`i18n_strings`/翻訳テーブル。
- **ロール/権限**：EXPORT_PARTNER ロール、AUTO_EXPORT_ACCESS / EXPORT_PROJECT_ENTRY / EXPORT_VEHICLE_SELECT / EXPORT_ADMIN の権限キー。
- **plpgsql**：`export_entry_reserve`（原子ENTRY）、AVAILABLE集約ビュー。
- **画面**：案件組成（パートナー）、本部承認、コンテナ/ガジェット管理、加盟者ENTRY、船UI進捗、輸出完了・実績入力、ガジェット精算、パートナー用多言語導線。

## 4. 重大リスク・要注意点
1. **【最重要】預かり金は加盟者ごと単一プール**：輸出ENTRYのAVAILABLE判定は、自動売買の予算配分・半自動・仕入中の未精算案件をすべて差し引いた実残で行う。→ 横断的な予約集約を1本化。
2. **EXPORT_PARTNER（外部）のデータ隔離**：他加盟者の預かり金・利益・機密を見せない。RLS＋画面の両方で制限。
3. **原子性**：ガジェット確保と資金予約は同一Tx（片肺禁止）。上記plpgsqlで担保。
4. **精算の再計算整合**：取消・再精算で預かり金/ロイヤリティ/出納が破綻しないよう既存整合モデルを踏襲。
5. **為替（現地入金額）**：精算に外貨・レート項目。MVPは手入力、自動為替は第二フェーズ。
6. **i18n後付けコスト**：範囲を絞らないと膨らむ。

## 5. より合理的な提案（#27）
- **精算は二重実装しない**：ガジェットは独立テーブルにしつつ、精算は既存 vehicle_deals パイプラインへ寄せる（費用/損益/相殺/監査を再利用）。
- **資金は単一台帳＋横断AVAILABLE**（モジュール別台帳に分けない）。
- **EXPORT_ADMIN は新規アカウントより admin＋権限付与**でコスト削減（パートナーのみ新ロール）。
- **船/コンテナの演出は第二フェーズ**でも実害なし。MVPは状態機械＋資金整合＋排他を最優先。

## 6. MVP と第二フェーズ（相談書の12項目を現実的に取捨）
**MVP**：ロール/権限、案件・可変ガジェット、1ガジェット=1車両=1加盟者（DB制約）、対象通知、ENTRY＋資金判定＋原子予約＋排他、有料フラグでの車両選択、募集停止/本部・パートナー枠取得、状態機械（UIは簡素でも可）、輸出完了・実績入力・ガジェット単位精算、預かり金相殺・出納反映、監査ログ、JP/EN。
**第二フェーズ**：船/コンテナ演出の作り込み、自動為替、船舶追跡、書類自動生成、決済連動、AI車両選定、積載シミュレーション、外部API。

## 7. 質問 #13〜#27 一問一答
- **#13 流用可能な機能**：預かり金台帳/出納、案件・費用・損益整合、通知、監査ログ、権限マトリクス、在庫/市場検索、原子予約の手法。→ §1。
- **#14 新規範囲**：export_projects/gadgets/fund_reservations、EXPORT_PARTNERロール、輸出権限キー、多言語、船/コンテナUI。→ §3。
- **#15 1ガジェット1加盟者の排他**：行ロック（FOR UPDATE）＋部分ユニークインデックス。→ §2-2。
- **#16 ガジェット確保＋資金予約の原子処理**：可能。単一plpgsql関数＝1トランザクション。→ §2-2。
- **#17 TOTAL/RESERVED/USED/AVAILABLE と出納連携**：既存 `ledger_entries` をTOTAL源、予約は fund_reservations、AVAILABLEは横断集約。→ §2-1。
- **#18 入金後の再計算タイミング**：本部の入金確認→台帳反映時に再計算（既存踏襲）。→ §2-1。
- **#19 有料権限 ON/OFF の最小工数**：加盟者フラグ方式（feature_ai同型）＋本部手動ON、将来決済連動。→ §2-4。
- **#20 車両検索画面の流用**：既存在庫/市場検索を流用＋本部承認。→ §2-4。
- **#21 コンテナ→船 UIのステータス連動**：状態機械駆動の画面モード切替。→ §2-6。
- **#22 ガジェット損益・精算と預かり金台帳の紐付け**：settlement→ledger_entries相殺＋gadgetロック。→ §2-3。
- **#23 精算取消・再精算・ログ**：取消/再精算を履歴化（deleted_deals相当）＋audit_logs。→ §2-3。
- **#24 多言語の将来拡張**：文言外出し（翻訳テーブル）でMVPはJP/EN、現地語後追加。→ §2-5。
- **#25 MVP工数・費用・期間**：§6の範囲で、§8「先に決めたい5項目」確定後に確定見積を提示（相対規模の目安：状態機械＋資金整合＋排他が最大工数、UI演出/多言語/外部連携は次点）。
- **#26 第二フェーズ回し**：自動為替・船舶追跡・書類自動生成・決済連動・AI選定・積載シミュ・外部API。→ §6。
- **#27 より合理的な提案**：§5。

## 8. 付録C「最初に決めたい5項目」への開発側たたき台
1. **DB親子構造**：project(1)–gadget(N)。gadget が member/vehicle/reservation/settlement を参照。資金は member 単位の単一台帳＋横断予約。
2. **ENTRY 排他＋資金予約Tx**：`export_entry_reserve` plpgsql（FOR UPDATE＋AVAILABLE判定＋予約）。
3. **既存出納・預かり金連携**：ledger_entries をTOTAL源に、settlementで相殺。予約は fund_reservations で横断集約。
4. **通常/有料の権限制御**：role_permissions＋加盟者フラグ（EXPORT_VEHICLE_SELECT）。
5. **MVP/第二フェーズ線引き**：§6。

---
※本書は相談書に対する開発側の初期分析であり、確定仕様ではない。実運用・技術検討により継続的に加筆・修正する前提。
