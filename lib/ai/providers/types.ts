/**
 * AIプロバイダ抽象化レイヤーの型定義。
 *
 * 設計:
 *   - 3つのSDKは形が違うので、共通の入力/出力型に正規化する。
 *   - 「会話履歴」「Tool呼び出し」「Tool結果」を プロバイダ非依存の形で表現。
 *   - 各プロバイダ実装は AIProvider インターフェースを実装する。
 *
 * これで route ハンドラはプロバイダ名を切り替えるだけで全プロバイダ対応できる。
 */

export type ProviderId = 'claude' | 'openai' | 'gemini'

/** 1つの Tool 定義 (プロバイダ非依存) */
export type AITool = {
  name: string
  description: string
  /** JSON Schema (draft 7 互換) */
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/** 画像入力（任意拡張・画像解析）。data は base64（data: 接頭辞なし）。 */
export type AIImage = { media_type: string; data: string }

/** 会話履歴の1ターン (ユーザ発言・アシスタント発言・Tool結果) */
export type AIChatTurn =
  | { role: 'user'; content: string; images?: AIImage[] }
  | {
      role: 'assistant'
      /** AIが返したテキスト本文。tool_useのみの場合は空文字も可 */
      content: string
      /** AIが呼んだTool. assistant ターンで埋まる */
      tool_calls?: AIToolCall[]
    }
  | {
      role: 'tool'
      /** どのtool_useへの応答か */
      tool_call_id: string
      /** Tool実行の戻り値 (executeTool の result.result) — JSON化されてプロバイダへ送られる */
      content: unknown
    }

/** AIが行ったTool呼び出し */
export type AIToolCall = {
  id: string
  name: string
  input: Record<string, unknown>
}

/** 1リクエスト分のチャット入力 */
export type AIChatRequest = {
  systemPrompt: string
  tools: AITool[]
  history: AIChatTurn[]
  maxOutputTokens?: number
  /** 回答グレード等で解決したモデルID（未指定なら各プロバイダの既定） */
  model?: string
}

/** 1リクエスト分のチャット出力 */
export type AIChatResponse = {
  /** AIが返したテキスト本文 (tool_use のみで本文なしならnull) */
  text: string | null
  /** AIが呼んだTool. 空配列なら通常応答 */
  tool_calls: AIToolCall[]
  /** トークン使用量 (プロバイダごとに利用可能なフィールドだけ埋まる) */
  usage: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
  /** プロバイダの停止理由 ('end_turn' | 'tool_use' | 'max_tokens' 等) */
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'other'
}

/**
 * ストリーミング中に発生するイベント。
 * テキストはデルタ(差分)単位で送られ、最後に1度だけ完了イベントが来る。
 */
export type StreamEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'done'; response: AIChatResponse }

/** AIプロバイダ実装が満たすべきインターフェース */
export interface AIProvider {
  readonly id: ProviderId
  readonly displayName: string
  readonly model: string
  /** 1ホップ分のチャットリクエスト (非ストリーム) */
  chat(req: AIChatRequest): Promise<AIChatResponse>
  /**
   * 1ホップ分のチャットリクエスト (ストリーム).
   * Async generator で順次イベントを yield する。
   * 最後に必ず 'done' イベントを yield して終わる。
   */
  chatStream(req: AIChatRequest): AsyncGenerator<StreamEvent, void, unknown>
  /** API キーが環境変数に設定されているか */
  isConfigured(): boolean
}
