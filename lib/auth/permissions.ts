/**
 * 機能アクセスマトリクス (コード定義・単一の真実の源)。
 * 要求事項定義書 5.1「権限に応じて利用可能画面・機能を制限」を TypeScript で表現。
 *
 * ロール (要求書 5.1): 管理者 / 加盟店 / CRM入力担当 / チャット専用
 *
 *   | 機能      | 管理者(admin) | CRM入力担当(crm_staff) | チャット専用(chat_only) | 加盟店(member) |
 *   | --------- | ------------- | ---------------------- | ----------------------- | -------------- |
 *   | members   | full          | full                   | none                    | none           |
 *   | crm       | full          | full                   | none                    | none           |
 *   | plans     | full          | none                   | none                    | none           |
 *   | settings  | full          | none                   | none                    | none           |
 *   | reports   | full          | full                   | none                    | own            |
 *   | orders    | full          | full                   | none                    | own            |
 *   | chat      | full          | full                   | full                    | own            |
 *   | ai        | full          | optional               | optional                | optional       |
 */
import type { UserRole } from '@/types/database'

export type Feature =
  | 'members'
  | 'crm'
  | 'plans'
  | 'settings'
  | 'reports'
  | 'orders'
  | 'chat'
  | 'ai'

export type Access = 'full' | 'own' | 'none' | 'optional'

export const FEATURES: Feature[] = ['members', 'crm', 'plans', 'settings', 'reports', 'orders', 'chat', 'ai']

export const FEATURE_LABEL: Record<Feature, string> = {
  members: '会員管理',
  crm: 'CRM',
  plans: 'プラン管理',
  settings: 'システム設定',
  reports: 'レポート',
  orders: 'オーダー',
  chat: 'チャット',
  ai: 'AI',
}

export const ACCESS_MATRIX: Record<Feature, Record<UserRole, Access>> = {
  members:  { admin: 'full', crm_staff: 'full',     chat_only: 'none', member: 'none' },
  crm:      { admin: 'full', crm_staff: 'full',     chat_only: 'none', member: 'none' },
  plans:    { admin: 'full', crm_staff: 'none',     chat_only: 'none', member: 'none' },
  settings: { admin: 'full', crm_staff: 'none',     chat_only: 'none', member: 'none' },
  reports:  { admin: 'full', crm_staff: 'full',     chat_only: 'none', member: 'own' },
  orders:   { admin: 'full', crm_staff: 'full',     chat_only: 'none', member: 'own' },
  chat:     { admin: 'full', crm_staff: 'full',     chat_only: 'full', member: 'own' },
  ai:       { admin: 'full', crm_staff: 'optional', chat_only: 'optional', member: 'optional' },
}

/** role が feature にアクセスできるか (none 以外なら true)。コード既定のみ（上書き無視）。 */
export function canAccess(role: UserRole, feature: Feature): boolean {
  return ACCESS_MATRIX[feature][role] !== 'none'
}

/** role の feature に対するアクセスレベル（コード既定）。 */
export function accessLevel(role: UserRole, feature: Feature): Access {
  return ACCESS_MATRIX[feature][role]
}

// ==== 権限マトリクスの上書き（本部が画面で編集・migration 057） ====
// 編集できるのは CRM入力担当・チャット専用のみ。管理者は常に全権、加盟店は固定（ガード）。
export const EDITABLE_ROLES: UserRole[] = ['crm_staff', 'chat_only']

/** 上書きマップのキー。 */
export function permKey(role: UserRole, feature: Feature): string {
  return `${role}:${feature}`
}

/**
 * 上書きを考慮したアクセス可否（純関数）。overrides は role_permissions を読み込んだ Map<`role:feature`, boolean>。
 *   - 管理者：常に true（締め出し防止・編集対象外）。
 *   - 加盟店：コード既定で固定（編集対象外）。
 *   - CRM入力担当・チャット専用：上書きがあればそれ、無ければコード既定。
 */
export function canAccessWith(role: UserRole, feature: Feature, overrides: Map<string, boolean>): boolean {
  if (role === 'admin') return true
  if (!EDITABLE_ROLES.includes(role)) return canAccess(role, feature) // 加盟店など＝固定
  const ov = overrides.get(permKey(role, feature))
  return ov !== undefined ? ov : canAccess(role, feature)
}
