import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--font-inter)',
          'var(--font-noto-sans-jp)',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        // === CARBAY ブランドカラー (ロゴの鮮やかなビビッドレッド基調) ===
        // ログイン画面と同等のビビッド純レッド。彩度を最大化して全画面で鮮やかに。
        brand: {
          50: '#fff1ef',
          100: '#ffe0dc',
          200: '#ffc4bd',
          300: '#ff9b90',
          400: '#ff6151',
          500: '#fb2c1d', // ブランド赤 (ビビッド・プライマリ)
          600: '#ed1505',
          700: '#c70f04',
          800: '#a3120a',
          900: '#86160f',
        },
        // === エンタープライズ SaaS シェル (Deep Navy 基調) ===
        // サイドバー・ダーク面に使用
        navy: {
          50: '#f1f5f9',
          100: '#e2e8f0',
          700: '#1e293b',
          800: '#0f172a', // Deep Navy (要求: #0F172A)
          850: '#0b1220',
          900: '#0a0f1d',
          950: '#070a14',
        },
        // 加盟店ダークテーマ (カンプ: 黒〜濃紺 + ネオンレッド)
        carbon: {
          950: '#080b14', // 最深部 (アプリ背景)
          900: '#0c1120', // パネル背景
          850: '#111829', // カード背景
          800: '#16203a', // カード内・ホバー
          700: '#1f2b47', // ボーダー
          600: '#2b3a5c', // 明るめボーダー
        },
        // === スレートグレー (本文・ボーダー・サブテキスト) ===
        // Tailwind 標準 slate を踏襲しつつ意味づけ
        ink: {
          DEFAULT: '#0f172a',
          muted: '#334155', // Secondary: Slate Gray (要求: #334155)
        },
        // === 情報系アクセント (リンク・補助・チャート) ===
        // ビビッドなエレクトリックブルー。チャート・リンクで鮮やかに映える。
        info: {
          50: '#eff5ff',
          100: '#dbe8fe',
          200: '#bfd5fe',
          500: '#3b7bf6',
          600: '#1d5cf0', // Electric Blue — データ可視化・リンク補助 (彩度UP)
          700: '#1546d4',
        },
        teal: {
          50: '#ecfeff',
          100: '#cffafe',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
        },
        // 互換: ログイン画面のグラデーション用 (teal と同義)
        accent: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 4px 12px -2px rgb(15 23 42 / 0.10)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
    },
  },
  plugins: [],
}

export default config
