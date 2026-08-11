/** Carbey ブランドのメールテンプレート (招待・パスワード再設定)。 */

const BRAND = '#f15a5a'
const NAVY = '#0d1220'

function layout(opts: { heading: string; bodyHtml: string; ctaLabel: string; ctaUrl: string; footnote?: string }): string {
  return `<!doctype html>
<html lang="ja">
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <tr><td style="background:${NAVY};padding:24px 32px;">
          <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-.02em;">CARBAY Home Dealer</span>
          <span style="color:rgba(255,255,255,.5);font-size:13px;margin-left:8px;">加盟店プラットフォーム</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${opts.heading}</h1>
          <div style="font-size:14px;line-height:1.7;color:#4b5563;">${opts.bodyHtml}</div>
          <div style="margin:28px 0;">
            <a href="${opts.ctaUrl}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:10px;">${opts.ctaLabel}</a>
          </div>
          <p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:16px 0 0;">
            ボタンが押せない場合は、以下のURLをブラウザに貼り付けてください：<br>
            <a href="${opts.ctaUrl}" style="color:${BRAND};word-break:break-all;">${opts.ctaUrl}</a>
          </p>
          ${opts.footnote ? `<p style="font-size:12px;color:#9ca3af;margin:16px 0 0;">${opts.footnote}</p>` : ''}
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} Carbey. このメールに心当たりがない場合は破棄してください。</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function inviteEmail(opts: { name: string | null; url: string }): { subject: string; html: string } {
  return {
    subject: '【カーベイホームディーラー】加盟店アカウントへのご招待',
    html: layout({
      heading: 'アカウント設定のご案内',
      bodyHtml: `${opts.name ? `${opts.name} 様<br><br>` : ''}カーベイホームディーラー 加盟店プラットフォームへご招待いたします。<br>下のボタンから初回パスワードを設定し、ログインを開始してください。`,
      ctaLabel: 'パスワードを設定する',
      ctaUrl: opts.url,
      footnote: 'このリンクの有効期限が切れた場合は、本部までお問い合わせください。',
    }),
  }
}

export function recoveryEmail(opts: { url: string }): { subject: string; html: string } {
  return {
    subject: '【カーベイホームディーラー】パスワード再設定のご案内',
    html: layout({
      heading: 'パスワード再設定',
      bodyHtml: `パスワード再設定のリクエストを受け付けました。<br>下のボタンから新しいパスワードを設定してください。`,
      ctaLabel: 'パスワードを再設定する',
      ctaUrl: opts.url,
      footnote: 'お心当たりがない場合は、このメールを破棄してください。パスワードは変更されません。',
    }),
  }
}
