# 🐱 Koto Note

> 猫モチーフのかわいくて実用的なタスク管理 Web アプリ

![ブルー](https://img.shields.io/badge/color-%23A2C2D0-A2C2D0?style=flat-square)
![ピンク](https://img.shields.io/badge/color-%23F2CBC9-F2CBC9?style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38BDF8?style=flat-square&logo=tailwindcss)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite)

---

## ✨ このアプリについて

スプレッドシートでのタスク管理には限界がありました。

- 固定枠が広すぎて情報が見づらい
- Done になったタスクがリストに埋もれてアクティブなタスクが見えない
- ルーチン業務と臨時対応が混在して混乱する

そこで、くすみブルー × くすみピンク × やさしいデザインを大切にしながら、
これらの課題を一気に解決する Web アプリを作りました。

---

## 🎨 デザイン

| カラー | HEX | 使用箇所 |
|-------|-----|---------|
| ブルー | `#A2C2D0` | メインアクセント・ボタン・ボーダー |
| ピンク | `#F2CBC9` | サブアクセント・ダッシュボードカード |
| クリーム | `#FAF7F2` | ページ背景 |

---

## 🛠 主な機能

### 📋 ダッシュボード（折りたたみ可能）
- **ルーチン業務 🍜**: 毎日・毎週の定型作業
- **臨時対応 📷**: 突発的な依頼・対応メモ
- **予定 🎸**: 会議・締め切りスケジュール

### ✅ タスク管理
- 5種類のステータス（**Doing / Review / Pause / Waiting / Done**）をカラーバッジで管理
- 優先度（高/中/低）・期限日・メモを設定可能
- Done にすると自動でアーカイブに整理される
- アーカイブから「リストに戻す」機能付き

### ☁️ クラウド同期
- Google Sheets と自動同期
- PC・スマホ間でデータを共有可能
- `localStorage` にもバックアップ保存

---

## 🚀 使い方

```bash
# リポジトリをクローン
git clone https://github.com/minoritaniguchi-alt/hachiware-task-manager.git
cd hachiware-task-manager

# 依存パッケージをインストール
npm install

# 開発サーバーを起動
npm run dev
```

ブラウザで `http://localhost:5173` を開くとアプリが表示されます。

### 本番ビルド

```bash
npm run build
# dist/ フォルダに静的ファイルが生成されます
```

---

*Built with 💙*
