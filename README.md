# Telop Studio

ビルド不要の透過PNGテロップメーカー。

公開アプリ：[Telop Studio](https://sakrainari.github.io/telopstudio/)

[使い方](https://sakrainari.github.io/telopstudio/manual.html) / [仕様書](https://sakrainari.github.io/telopstudio/specification.html)

- `specification.html`：確定仕様書
- `manual.html`：完成版の使い方・GitHub Pages公開手順・検証範囲
- `index.html`：アプリ本体（HTTP/HTTPSで開く）
- `start-local.cmd`：Pythonを使ったローカル起動用。Node.js不要。

ローカル起動：このフォルダーで `python -m http.server 8766 --bind 127.0.0.1` を実行し、http://localhost:8766 を開きます。

GitHub Pages：このフォルダーの中身をリポジトリのルートに置き、Settings → Pages → Deploy from a branch → main / (root)。

フォントとZIP機能にはCDN接続が必要です。台本・設定はLocalStorageへ保存します。別のURLや別ブラウザへ移す場合はJSONで持ち出してください。

Clipchamp/Premiereへの直接貼り付けと実素材取り込みは未検証です。PNGファイルの出力とブラウザの画像コピーはChromeで確認済みです。
