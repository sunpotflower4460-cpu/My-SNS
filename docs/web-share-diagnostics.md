# Web Share diagnostics

My-SNSのゼロコスト投稿では、対応端末でWeb Share APIを使って投稿文と画像・動画をOS共有シートへ渡します。

`/app/share-diagnostics` は実機上で次を確認するための診断画面です。

- HTTPS / secure context
- `navigator.share()` の有無
- `navigator.canShare()` の有無
- `web-share` Permissions Policy（ブラウザから確認可能な場合）
- 投稿文を `canShare()` が受け付けるか
- 診断用1px PNGをファイル共有候補として `canShare()` が受け付けるか
- `navigator.userActivation` の有無
- document visibility state / User Agent

## 実テスト

診断画面には、ユーザー操作から直接次の2つを呼べるテストがあります。

1. 投稿文だけの `navigator.share()`
2. 診断用1px PNG付きの `navigator.share()`

どちらも共有シートを開くだけで、My-SNSからSNSへ自動投稿はしません。共有先を選ばずキャンセルしても構いません。

## 判定の限界

`navigator.canShare({ files })` が `true` でも、特定の共有先アプリがタイトル・本文・複数ファイル・動画をすべて同じように受け取る保証はありません。OSと共有先アプリの実装に依存します。

そのため実際の投稿パックでは、次の安全策を維持します。

- 投稿直前に実ファイルで `navigator.canShare({ files })` を再確認する
- 共有予定の素材に取得不能なものが1件でもあれば、勝手に省略せずfail closedする
- ファイル共有が拒否された場合は、素材の「開く・保存」＋SNS投稿画面へ戻す
- Web Shareが使えない環境では従来導線をそのまま残す
- 最終公開操作は共有先アプリ側でユーザーが行う

## エラー分類

投稿カードのWeb Shareエラーは次のように分類して説明します。

- `AbortError`: ユーザーキャンセル、または利用可能な共有先がない可能性
- `NotAllowedError`: Permissions Policy、ファイルの安全性判定、またはtransient user activation切れ
- `InvalidStateError`: ドキュメント非アクティブ、または共有処理の競合
- `TypeError`: 共有データやファイル形式・組み合わせをブラウザが受け付けない
- `DataError`: 共有先起動・データ受け渡し時の失敗

不明なエラーも黙って失敗せず、診断画面と従来投稿導線へ誘導します。
