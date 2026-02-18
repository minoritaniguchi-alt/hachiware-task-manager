# システムアーキテクチャ設計書

> ハチワレのタスク帳 — System Architecture Document
> 最終更新: 2026-02-18

---

## 1. 概要

スプレッドシートによるタスク管理の課題（固定枠の圧迫・Done タスクの埋没）を解消するため、
ハチワレをモチーフにした Web アプリとして設計。単一 HTML ファイルとして動作し、
バックエンド不要・localStorage のみで永続化する「ゼロ依存デプロイ」を実現する。

---

## 2. 技術スタック

| レイヤー | 技術 | バージョン | 役割 |
|---------|------|-----------|------|
| UI フレームワーク | React | 19.x | コンポーネント管理 |
| ビルドツール | Vite | 6.x | 開発サーバー・バンドル |
| スタイリング | Tailwind CSS | 3.x | ユーティリティクラス |
| アイコン | lucide-react | latest | SVG アイコン |
| フォント | Noto Sans JP | - | 日本語フォント（Google Fonts） |
| 状態管理 | React useState | - | ローカル状態 |
| 永続化 | localStorage | - | ブラウザストレージ |

---

## 3. ディレクトリ構成

```
hachiware-task-manager/
├── src/
│   ├── App.jsx          # メインコンポーネント（全コンポーネントを内包）
│   ├── index.css        # Tailwind ディレクティブ + カスタム CSS
│   └── main.jsx         # React DOM レンダリングエントリ
├── docs/
│   ├── system_arch.md   # 本ファイル：アーキテクチャ・データ構造
│   ├── ui_design.md     # カラーパレット・コンポーネント設計
│   └── features.md      # 機能仕様・アルゴリズム詳細
├── index.html           # HTML エントリポイント（Google Fonts 読み込み）
├── tailwind.config.js   # Tailwind カラー拡張・アニメーション定義
├── vite.config.js       # Vite 設定
└── README.md            # プロジェクト概要
```

---

## 4. コンポーネント構成

```
App (root)
├── <header>            # スティッキーヘッダー（ロゴ・統計バッジ）
├── <main>
│   ├── DashboardSection
│   │   └── DashboardCard × 3  # ルーチン / 臨時対応 / 予定
│   ├── TaskInputForm    # タスク追加フォーム（展開可能）
│   ├── ActiveTaskList
│   │   └── TaskRow × N  # アクティブなタスク一覧
│   └── ArchiveSection
│       └── TaskRow × N  # Done タスク（折りたたみ）
└── Toast               # 完了・追加時のフィードバック通知
```

---

## 5. localStorage データ構造

### 5-1. タスクデータ

**キー:** `hachiware-tasks-v1`
**型:** `Task[]` (JSON 配列)

```typescript
interface Task {
  id: string;          // Date.now().toString() — ユニーク ID
  title: string;       // タスクタイトル
  memo: string;        // 補足メモ（任意）
  status: 'doing' | 'review' | 'pause' | 'waiting' | 'done';
  priority: 'high' | 'medium' | 'low';
  dueDate: string;     // YYYY-MM-DD 形式（任意）
  createdAt: string;   // ISO 8601 形式
  completedAt: string | null;  // done に変更された時刻、それ以外は null
}
```

### 5-2. ダッシュボードデータ

**キー:** `hachiware-dashboard-v1`
**型:** `DashboardData` (JSON オブジェクト)

```typescript
interface DashboardItem {
  id: string;    // Date.now().toString()
  text: string;  // 項目テキスト
}

interface DashboardData {
  routine:  DashboardItem[];  // ルーチン業務
  adhoc:    DashboardItem[];  // 臨時対応
  schedule: DashboardItem[];  // 予定
}
```

---

## 6. 状態管理フロー

```
ユーザー操作
    │
    ▼
useState setter (React)
    │
    ▼
useEffect → localStorage.setItem(KEY, JSON.stringify(state))
    │
    ▼
次回リロード: useState initializer で localStorage.getItem(KEY) を復元
```

---

## 7. ビルド・デプロイ

```bash
# 開発サーバー起動
npm run dev

# 本番ビルド
npm run build
# → dist/ に静的ファイルが生成される

# プレビュー
npm run preview
```

生成された `dist/` フォルダは、GitHub Pages / Netlify / Vercel 等にそのままデプロイ可能。

---

## 8. 今後の拡張検討

- タグ・カテゴリ機能（localStorage スキーマに `tags: string[]` を追加）
- ドラッグ＆ドロップによる並び替え（`@dnd-kit/core` 導入）
- CSV エクスポート機能
- PWA 対応（Service Worker + manifest.json）
