# 🐱 Koto Note

> 猫モチーフのかわいくて実用的なタスク管理 Web アプリ

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38BDF8?style=flat-square&logo=tailwindcss)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite)
![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-deployed-222222?style=flat-square&logo=github)

🔗 **公開URL**: https://minoritaniguchi-alt.github.io/hachiware-task-manager/

---

## ✨ このアプリについて

スプレッドシートでのタスク管理の課題を解決するために作った Web アプリです。

- アクティブなタスクと完了済みタスクを自動で分離
- ルーチン業務・臨時対応・予定をダッシュボードで整理
- Google Sheets と自動同期し、PC・スマホどこからでも確認可能

---

## 🎨 デザイン

| カラー | HEX | 使用箇所 |
|--------|-----|---------|
| ブルー | `#A2C2D0` | メインアクセント・ボタン・ボーダー |
| ピンク | `#F2CBC9` | 臨時対応カード |
| グリーン | `#C8D8A8` | 予定カード |
| クリーム | `#FAF7F2` | ページ背景 |

---

## 🛠 主な機能

### 📋 ダッシュボード

3カテゴリで業務を整理できます。各カテゴリへの追加・編集・削除が可能です。

| カテゴリ | 用途 |
|---------|------|
| ルーチン業務 🍜 | 毎日・毎週の定型作業 |
| 臨時対応 📷 | 突発的な依頼・対応メモ |
| 予定 🎸 | 会議・締め切りスケジュール |

**登録できる情報：**
- 業務名
- スケジュール（繰り返し設定 + 時間帯）
- 業務詳細
- リンク（URL・表示名）

#### 🔄 スケジュール（繰り返し設定）

業務ごとに繰り返しパターンと時間帯を設定できます。

| 設定 | 例 |
|------|---|
| 繰り返さない | — |
| 毎日 | 毎日 09:00〜10:00 |
| 毎週 | 毎週 水曜 12:00〜13:00 |
| 毎月 | 毎月 第3土曜 |
| 毎年 | 毎年 2月21日 |
| 毎週 平日 | 毎週 平日（月〜金） |
| カスタム | 任意の曜日を複数選択 |

時間は 15 分刻みで設定可能。設定したスケジュールは業務名の下に 🔄 ラベルで表示されます。

---

### ✅ タスク管理

- タスクの追加・編集・削除
- 5種類のステータスをカラーバッジで管理

| ステータス | 意味 |
|-----------|------|
| 🚀 doing | 作業中 |
| 💬 review | レビュー中 |
| ⏸️ pause | 一時停止 |
| ⏳ waiting | 待機中 |
| 💚 done | 完了 |

- 期限日・詳細・進捗メモ・リンクを設定可能
- ステータスフィルターで done タスクを一覧表示
- done タスクは別のステータスに変更することでリストに戻せる

---

### 📖 手順書

自由にカテゴリを作成し、リンクをまとめて管理できるタブです。

- カテゴリの追加・削除・リネーム
- 各カテゴリにリンク（URL・表示名・備考）を登録
- 登録後にインライン編集・削除が可能

---

### 🔗 リンク管理

ダッシュボード業務・タスクともに複数のリンクを登録できます。

- URL と表示名を設定
- 登録後にインライン編集・削除が可能

---

### ☁️ Google Sheets 同期

- データ変更から 1.5 秒後に自動で Google Sheets へ保存
- アプリ起動時に Sheets からデータを読み込み
- `localStorage` にもバックアップ保存（オフライン対応）
- ヘッダー行付きの見やすいフォーマットで保存

**スプレッドシート構成：**

`タスク` シート：`ID / タイトル / 詳細 / 進捗メモ / ステータス / 期限 / リンク / 作成日時 / 完了日時`

`ダッシュボード` シート：`ID / カテゴリ / 業務名 / 詳細 / 進捗メモ / リンク / スケジュール`

`手順書` シート：`カテゴリID / カテゴリ名 / アイテムID / 表示名 / URL / 備考`

---

## 🚀 ローカルで動かす

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

---

## 📦 デプロイ（GitHub Pages）

```bash
npm run build && npm run deploy
```

---

## ⚙️ Google Sheets 連携のセットアップ

Google Sheets との同期には Google Identity Services (GIS) を使った OAuth 認証を利用しています。Google Apps Script は不要です。

### 1. OAuth クライアント ID を取得する

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成（または既存を選択）
2. 「API とサービス」→「有効な API とサービス」から **Google Sheets API** を有効化
3. 「認証情報」→「認証情報を作成」→「OAuth クライアント ID」
4. アプリケーションの種類：**ウェブアプリケーション**
5. 承認済みの JavaScript 生成元に以下を追加：
   - `http://localhost:5173`（開発環境）
   - `https://<your-github-username>.github.io`（本番環境）
6. 作成後に表示される **クライアント ID** をコピー

### 2. 環境変数を設定する

プロジェクトルートに `.env.local` を作成し、取得したクライアント ID を設定します。

```
VITE_GIS_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
```

GitHub Pages へのデプロイ時は、リポジトリの **Settings → Secrets and variables → Actions** に `VITE_GIS_CLIENT_ID` を登録してください。

### 3. アプリからログインする

アプリを起動すると Google ログイン画面が表示されます。ログインするとスプレッドシートが自動作成され、データの同期が始まります。

---

## 🏗 技術スタック

| 技術 | バージョン | 用途 |
|------|-----------|------|
| React | 19 | UI フレームワーク |
| Vite | 7 | ビルドツール |
| Tailwind CSS | 3 | スタイリング |
| Lucide React | 最新 | アイコン |
| gh-pages | 最新 | GitHub Pages デプロイ |
| Google Identity Services | — | OAuth 認証 |
| Google Sheets API | v4 | データ永続化 |

---

*Built with 💙*
