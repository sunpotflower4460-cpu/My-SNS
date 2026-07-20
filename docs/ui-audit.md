# UI 一貫性監査（UI-PR0）

更新: 2026-07-20 / 対象: `sunpotflower4460-cpu/My-SNS`

UI/UX再設計（`My-SNS_UIUX再設計・実装指示書`）の起点として、現状のUI要素を棚卸しし、一貫性の問題と是正方針を記録する。UI-PR0 では **route/schema/挙動を変えず**、共通トークンとコンポーネントの土台のみ導入する。

## 1. 良い土台（維持する）

- 暖色寄りの stone + violet の静かな配色
- 大きめの角丸と余白
- 各機能の丁寧な日本語説明
- 空状態 / 成功 / 失敗の用意
- モバイルドロワー（`MobileNav`）
- AIの推測・未対応・接続不足を隠さない（fail-closed の可視化）
- 権限（`PermissionGate` / role）がUIに反映

## 2. 見つかった一貫性の問題

### 2.1 角丸がばらつく
`rounded-*` の使用回数（`src/components` + `src/app`）:

| クラス | 概数 |
|---|---|
| `rounded-2xl`（16px相当だが実際は少し大） | ~138 |
| `rounded-full` | ~65 |
| `rounded-[2rem]`（32px） | ~44 |
| `rounded-xl` | ~21 |

→ **是正**: 3段階のトークンへ収斂（`--radius-control` 12px / `--radius-card` 16px / `--radius-container` 24px）。Tailwind に `rounded-control|card|container` を追加。既存画面は据え置き、新規コンポーネントから使用。

### 2.2 ボタンの表現が都度手書き
プライマリが `bg-violet-600`（22ファイル）と `bg-gray-900` の2系統で混在し、サイズ・角丸・disabled・loading もばらばら。1画面に複数の強い（primary）ボタンが並ぶ箇所がある。

→ **是正**: `Button`（primary/secondary/ghost/destructive、sm/md、loading、min 44px touch）に集約。原則1画面1プライマリ。

### 2.3 バッジ/ステータスが色依存
`StatusBadge` は15種の色マップで状態を表すが、アイコンがなく色のみで意味を伝えている箇所が多い（`uppercase`/広いletter-spacingは日本語化で概ね除去済み）。

→ **是正**: `Badge`（tone + 任意アイコン）。状態は色だけで表さない（✓ / ! / × / ○ を併用）。`InlineAlert` もアイコン付き。

### 2.4 アイコンが絵文字・記号・文字の混在
ナビは絵文字（🌱 📬 🗓️ …）＋記号（⊞ ◌）。`EmptyState` も絵文字。`PlatformBadge`/`ChannelBadge` は文字ラベル。

→ **是正**: `lucide-react` を導入し `NAV_ICONS` マッピングを用意（段階移行）。絵文字は空状態の装飾のみ許容。

### 2.5 すべてがカード
ほぼ全情報が「白背景・枠線・大角丸カード」で同じ強さ。重要/補足/履歴/操作/警告の視覚差が弱い。入れ子カードの連続も見られる。

→ **是正**: `Card`（tone: default/muted/selected/warning/error/success、size: card/container、`elevated` は浮かせる要素のみ）。区切り線と余白でグループ化し、shadow を濫用しない。

### 2.6 フィードバックが画面上部に積む
成功メッセージを各ページのローカル state で上部に表示。トースト基盤がない。

→ **是正**: `ToastProvider` / `useToast`（aria-live、自動消滅）。操作が必要な失敗は `InlineAlert`（永続）に分離。

### 2.7 モーダル/シート/メニューの基盤欠如
確認は `window.prompt()`（公開キューの手動完了）や個別実装。フォーカストラップ・Escape・フォーカス復帰が無い。

→ **是正**: `Dialog` / `Sheet`（`useFocusTrap` 共有: Tabトラップ・Escape・フォーカス復帰）、`ActionMenu`（外側クリック/Escape）。

### 2.8 フォームのラベル紐付けが不徹底
`<label htmlFor>` / `aria-describedby` / `aria-invalid` の関連付けが画面ごとにまちまち。

→ **是正**: `FormField`（label/description/error を id で関連付け）。

### 2.9 タップ標的・フォーカス可視
小さめのボタン（`px-3 py-1`）が多く、モバイル44px未満の恐れ。`focus:outline-none` でリングを消している箇所がある。

→ **是正**: グローバルに `:focus-visible` リングを付与（消さない）。`Button`(md)/`IconButton` は44pxのタッチ variant。`reduced-motion` 尊重、safe-area ヘルパ。

### 2.10 専門語がUIに露出
`シード` `Revision` `ジョブ` `CTA` `publishMode` `取り込み済み` `準備完了` 等が利用者画面に出る（内部名は維持可）。

→ **是正**: 表示層で自然な日本語へ（本PRでは用語辞書は未導入。後続 UI-PR で `ui-copy.ts` を用意予定）。

## 3. UI-PR0 で導入したもの

- **トークン**: `src/app/globals.css`（surface/text/border/focus、radius、control height、`:focus-visible`、reduced-motion、safe-area）＋ `tailwind.config.ts`（`rounded-control|card|container`、`min-h-control|touch`、`ring-focus`）
- **共通コンポーネント**（`src/components/ui/kit/`）: `Button` `IconButton` `Card` `Badge` `InlineAlert` `FormField` `SegmentedControl` `ActionMenu` `Dialog` `Sheet` `Skeleton` `StickyActionBar` `ToastProvider`/`useToast`
- **アイコン基盤**: `lucide-react` ＋ `NAV_ICONS`
- **アクセシビリティ基盤**: `useFocusTrap`（Dialog/Sheet 共有）、`:focus-visible`、44pxタッチ、aria 紐付け、reduced-motion、safe-area
- **ユーティリティ**: `cn`（依存なしのクラス結合、単体テスト付き）
- **試験適用**: `ToastProvider` をアプリ全体にマウント（既存フィードバックは不変）、`CreatorStatusBar` を `Button`/`Card`/`useToast` で置換しAPIを検証

## 4. まだ変えていない（後続 UI-PR）

- ナビの目的別グループ化・モバイル下部ナビ（UI-PR1）
- ホームの「今日やること」化（UI-PR1）
- 新しい発信フロー3ステップ（UI-PR2）
- 発信詳細の統合ワークスペース（UI-PR3）
- 媒体別エディタ / メディア選択（UI-PR4）
- 公開予定の状態グループ化・`window.prompt` 廃止（UI-PR5）
- 受信箱 Split View（UI-PR6）
- カレンダー / 接続センター（UI-PR7）
- 分析階層・最終仕上げ（UI-PR8）

既存の `StatusBadge` `PlatformBadge` `EmptyState` `PageHeader` 等は本PRでは温存し、各後続PRで段階移行する。
