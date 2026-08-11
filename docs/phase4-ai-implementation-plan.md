# Phase 4 AI機能 実装計画（Senior Engineer 版）

確定した顧客要件（カーセンサー市場データのスナップショット分析／加盟者ごとの検索・蓄積／本部・加盟店の2系統／使用量メータリング／本部が設定できる権限／段階的な build-and-gate）に基づく、具体的な実装ステップ。

要件・費用は [phase4-ai-requirements.md](./phase4-ai-requirements.md)、スナップショットの確定モデルはメモ `phase4-ai-snapshot-model` を参照。**拡張メニュー・価格・加盟者向け可視化は Phase 4 完了後**（本計画のスコープ外）。

---

## 0. Architecture decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| DB | 単一 Supabase・スキーマ分離：**`portal`** が AI会話/使用量/設定（加盟者スコープ）、**`public`** が カーセンサー市場データ（portal からは読み取り専用） | 相乗り決定の帰結（architecture.md）。ポータルは市場データを再スクレイプせず参照 |
| Provider layer | `Carbey/lib/ai/providers/*` → `lib/portal/ai/providers/*` を **そのまま移植**（Claude / OpenAI / Gemini registry） | ゼロ改変で移植可能 |
| Market tools | `lib/ai/tools.ts` + `executeTool.ts` を移植。クエリは `public.recent_market_observations` / `cs_market_observations` / `inventory_with_metrics` を **public スキーマ用クライアント**（`db:{schema:'public'}`）で参照 | カーセンサーのスナップショットは分析サイト資産を流用 |
| Scope | 加盟店AI = **厳密に `member_id` スコープ**／本部AI = クロステナント読み取り | 他社データ露出禁止（crm-member.ts と同原則） |
| Metering | **1回答成功ごとに 1 ユニット消費**。呼び出し前に残数チェック、成功後にコミット | 失敗課金を避ける／二重課金防止 |
| Config resolution | `effective = member_override ?? plan_default`。ゲート = `feature_ai` ∧ `ACCESS_MATRIX.ai`/`role_permissions` ∧（加盟店: オンボ完了）∧ remaining>0 | 既存の権限基盤を再利用 |

---

## 1. Data model — migrations 059+（作成は開発、適用はクライアント "done N"）

- **059 `plans` AI設定**：`ai_monthly_searches int`、`ai_model_tier text check(light|standard|premium)`、`ai_carry_over bool`、`ai_image_enabled/ai_docgen_enabled/ai_deep_enabled bool`。（`feature_ai` は既存）
- **060 `members` AI上書き**（全て nullable = プラン既定を継承）：上記と同じ列。
- **061 `portal.ai_conversations`**（`id, scope 'member'|'hq', member_id nullable, title, created_by, created_at`）＋ **`portal.ai_messages`**（`conversation_id, role, content jsonb, model, input_tokens, output_tokens, created_at`）＋ RLS（加盟店: 自分のみ／スタッフ: 全件）。
- **062 `portal.ai_usage_ledger`**（`id, member_id, scope, kind 'search'|'image'|'docgen'|'deep', model_tier, unit_cost_yen, input_tokens, output_tokens, conversation_id, created_at`）＋ **`portal.ai_usage_month`**（`member_id, ym, allocated, used, carried_in, carried_out`）で繰越管理。
- **063 `portal.ai_saved_searches`**（`member_id, query, params jsonb, result_ref, created_at`）— 共通のカーセンサー市場データの上に載る、加盟者ごとの「検索・蓄積」ストア。

---

## 2. Build order（ステップ + 受け入れ基準）

### Step 1 — Foundation（制作イメージ非依存・先行着手可）
- Migrations 059–062。
- `lib/portal/ai-config.ts`：`getEffectiveAiConfig(memberId|null)`（plan+override マージ・React `cache()`）、`getRemainingSearches(memberId, ym)`（繰越込み）。
- `lib/portal/ai-usage.ts`：`assertQuota()`、`consumeUnit(kind)`、`rolloverMonth(ym)`（`carried_out = max(0, allocated + carried_in − used)`）。
- `lib/auth/session.ts` にゲート追加：`requireAiAccess(role, memberId)` = `canAccessWith(role,'ai',overrides)` ∧ plan `feature_ai` ∧（加盟店: オンボ完了）∧ remaining>0。
- **受け入れ (E2E)**：config マージ、残数デクリメント、月次繰越、remaining=0 / feature off / オンボ未完了で拒否。

### Step 2 — Provider + market tools 移植（バックエンド）
- providers をそのままコピー。`tools.ts`/`executeTool.ts` を **public スキーマ用クライアント**参照に移植。`conversationRepo.ts` を `portal.ai_conversations/messages`（`member_id` スコープ）へ書き換え。
- `client.ts` のシステムプロンプトを分岐：**加盟店**（広範囲: 中古車・経営・戦略・税務法律・FC… ＋ 市場分析ツール、税法免責）／**本部**（分析・サポート・壁打ち、クロステナント）。
- **受け入れ (E2E)**：加盟店クエリが `public.*` の市場ツールを呼び出し→返却→会話永続化→1ユニット消費。検索が `ai_saved_searches` に蓄積。

### Step 3 — 加盟店AI（β）— `app/portal/ai/`
- チャットUI（ダークテーマ・`Carbey/components/ai/AIChatPanel` を踏襲）、残検索回数バッジ、保存検索の一覧。
- ルート/サーバーアクション：ゲート → config解決 → provider（tier→model）→ **ストリーム** → 永続化 → メータリング。モデル階層 light/standard/premium → Haiku/Sonnet/Opus 級（またはプロバイダ相当）。
- **受け入れ**：手動 + E2E。テストは **test@gmail.com のみ**（ソフト削除済みの安全なテスト会員）。実在アカウントは絶対に触らない。

### Step 4 — 本部AI（β）— `app/admin/ai/`
- チャットUI（ライトテーマ）、本部プロンプト、クロステナント読み取り（全加盟店 + public 市場）。
- **受け入れ (E2E)**：本部は加盟店横断でクエリ可能／加盟店AIは不可。

### Step 5 — 本部設定 + ダッシュボード
- `plans` フォーム + `MemberFormFields`（上書き）+ 権限マトリクス（`ai` は既存）に AI設定を露出。
- `app/admin/ai-usage`：`ai_usage_ledger`/`ai_usage_month` から使用量ダッシュボード（加盟者ごとの used/remaining/carry）。
- **受け入れ (E2E)**：plan/member 設定が effective config に反映／ダッシュボード集計が台帳と一致。

### Step 6 — 任意拡張（build & gate OFF／価格は Phase 4 後）
- 画像解析（vision）、アップロード分析（Files/コンテナ）、書面・表計算生成（コード実行/スキル）、ディープ。各機能を加盟者ごとトグル、**既定オフ**、`kind` 別にメータリング。
- **受け入れ**：既定オフ。トグルONで有効化＋計上。価格はまだ表示しない。

---

## 3. Cross-cutting（senior-eng の注意点）

- **コスト制御**：システムプロンプト＋市場コンテキストを prompt-cache（`cache_control` → 約0.1×リード）。既定は **standard** 階層。¥10 を名目ユニットとしつつ、実トークンコストを記録し後日精算。
- **メータリング整合**：enforce-before / commit-after。`conversation_id`＋ターンでキー化したトランザクションで、リトライ／ストリーム再接続時の二重課金を防止。
- **RLS が実境界**（アプリコードではない）：`ai_conversations/messages/usage/saved_searches` に自分の `member_id` スコープの加盟店ポリシー＋スタッフ用クロステナント読み取りポリシー。
- **セキュリティ**：APIキーは env（DBに置かない）。加盟者スコープは RLS＋クエリで担保。税法免責はサーバー側で注入。分析サイトの認証情報は保存しない。
- **広範囲の安全策**：システムプロンプトは広いトピックを許容しつつ、税務・法律は「一般情報・専門家へ」に誘導。

---

## 4. Workflow & verification（プロジェクト規約）
- マイグレーションファイルは開発が作成 → クライアントが **"done N"** で適用。`SETUP_ALL.sql` の PostgREST 再読込マーカーの前にブロック追加、適用後に `NOTIFY pgrst`。
- E2E：`npx tsx --env-file=.env scripts/xxx.ts`（`ws` WebSocket polyfill・完全teardown・実行後スクリプト削除）。テスト会員は **test@gmail.com のみ**。
- :3000 サーバー起動は事前確認。テスト後は自動停止＋セッション/クッキー消去。

---

## 5. Out of scope（Phase 4 後・確定）
拡張メニューの確定、価格・納期、加盟者向けの 〈拡張可〉アイコン ＋ `/portal/expansions` 一覧ページ — Phase 4 完了後に着手。

---

## 推奨する最初のカット
**Step 1 + Step 2 + Step 3** で、メータリング・権限ゲート付きの加盟店AI（カーセンサー市場検索＋蓄積）＝最小βが動く。着手の起点は **migration 059 + `lib/portal/ai-config.ts` / `ai-usage.ts`**。
