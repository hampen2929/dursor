# UI/UX Improvement Plan v2 for dursor

このドキュメントは、dursor のUI/UXをより深く分析し、ユーザー体験の観点から改善すべき点を詳細にまとめています。v1 で特定された基礎的な問題に加え、より高度なUXの課題と解決策を提示します。

## 目次

1. [エグゼクティブサマリー](#エグゼクティブサマリー)
2. [ユーザージャーニー分析](#ユーザージャーニー分析)
3. [重要な改善領域](#重要な改善領域)
4. [詳細な改善提案](#詳細な改善提案)
5. [インタラクションデザイン改善](#インタラクションデザイン改善)
6. [情報アーキテクチャ改善](#情報アーキテクチャ改善)
7. [ビジュアルデザイン改善](#ビジュアルデザイン改善)
8. [実装優先度マトリクス](#実装優先度マトリクス)

---

## エグゼクティブサマリー

### 現状評価

dursor は機能的に優れたマルチモデル並列コーディングエージェントですが、以下の UX 課題が存在します：

| カテゴリ | 現状スコア | 目標スコア | 主な課題 |
|---------|-----------|-----------|---------|
| オンボーディング | 2/5 | 4/5 | 初回設定のガイダンス不足 |
| 情報設計 | 3/5 | 4/5 | 情報の階層が不明確 |
| タスク効率 | 3/5 | 5/5 | ワークフローの最適化が必要 |
| エラーハンドリング | 3/5 | 5/5 | 復旧パスが不明確 |
| 認知負荷 | 3/5 | 4/5 | 選択肢が多すぎる場面がある |

### v1 からの変更点

v1 ドキュメントでは技術的な問題（レスポンシブ、コンポーネント一貫性）に焦点を当てましたが、v2 ではユーザー中心設計の観点から改善点を追加しています。

---

## ユーザージャーニー分析

### ペルソナ

1. **新規ユーザー (田中さん)**
   - 初めて dursor を使用
   - GitHub App の設定が必要
   - 最初のタスクを作成したい

2. **リピートユーザー (佐藤さん)**
   - 既に設定済み
   - 効率的にタスクを管理したい
   - 複数の PR を並行して作成

3. **パワーユーザー (山田さん)**
   - キーボードショートカットを多用
   - 複数のリポジトリを管理
   - 自動化を求める

### 現在のユーザーフロー課題マップ

```
[初回アクセス] → [ホーム画面]
     ↓
[リポジトリ選択] ← ❌ GitHub App 未設定時のガイダンス不足
     ↓
[モデル選択] ← ❌ モデル未登録時の導線が弱い
     ↓
[指示入力] ← ⚠️ 例文やテンプレートがない
     ↓
[タスク作成] → [タスク詳細画面]
     ↓
[実行状況確認] ← ⚠️ 長時間実行時の進捗が不明確
     ↓
[結果確認] ← ⚠️ Diff の可読性改善が必要
     ↓
[PR 作成] ← ❌ PR 作成後のフローが不明確
```

---

## 重要な改善領域

### 1. オンボーディング体験の欠如 🔴 Critical

**現状の問題:**
- 初回アクセス時に何をすべきか分からない
- GitHub App 未設定時のエラーメッセージが技術的すぎる
- モデル未登録でもタスク作成画面が表示される

**影響:**
- ユーザーの離脱率が高くなる可能性
- サポートへの問い合わせ増加

**改善案:**

```tsx
// components/Onboarding/WelcomeFlow.tsx (新規)

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action: () => void;
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: 'github',
    title: 'GitHub App を接続',
    description: 'リポジトリにアクセスするために必要です',
    completed: false,
    action: () => openSettings('github'),
  },
  {
    id: 'model',
    title: 'モデルを追加',
    description: 'OpenAI、Anthropic、Google のAPIキーを登録',
    completed: false,
    action: () => openSettings('models'),
  },
  {
    id: 'first-task',
    title: '最初のタスクを作成',
    description: '準備完了！タスクを作成しましょう',
    completed: false,
    action: () => navigate('/'),
  },
];
```

**ホーム画面の改善案:**

```
┌─────────────────────────────────────────────────────────────┐
│  🎉 dursor へようこそ！                                       │
│                                                             │
│  セットアップを完了して、最初のタスクを作成しましょう              │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ✓ 1. GitHub App を接続        [完了]                    ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ → 2. モデルを追加              [設定する]                ││
│  │    OpenAI、Anthropic、または Google のAPIキー           ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ ○ 3. 最初のタスクを作成                                  ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

### 2. 認知負荷の軽減 🟠 High

**現状の問題:**

#### a) Executor 選択の複雑さ

現在の `ExecutorSelector` は以下の問題があります：

- モデル選択と CLI エージェント選択が混在
- 初見では何を選ぶべきか分からない
- 選択状態の視覚的フィードバックが弱い

**改善案:**

```
現在:
┌──────────────────────────────────────────┐
│ [Models ▼]                               │
│ ├── ✓ GPT-4                              │
│ ├── ✓ Claude 3.5 Sonnet                  │
│ └── ○ Gemini Pro                         │
│ ─────────────────────────────────────────│
│ CLI Agents                               │
│ ├── ○ Claude Code                        │
│ ├── ○ Codex                              │
│ └── ○ Gemini CLI                         │
└──────────────────────────────────────────┘

改善案:
┌──────────────────────────────────────────┐
│  実行方法を選択                           │
│                                          │
│  ┌─────────────────┐  ┌─────────────────┐│
│  │  🤖 並列モデル   │  │  💻 CLI Agent   ││
│  │  複数のモデルで  │  │  単一のCLIで    ││
│  │  同時に実行     │  │  対話的に実行    ││
│  │                 │  │                 ││
│  │  [選択中 ✓]     │  │  [選択]         ││
│  └─────────────────┘  └─────────────────┘│
│                                          │
│  選択したモデル: GPT-4, Claude 3.5       │
│  [モデルを変更]                          │
└──────────────────────────────────────────┘
```

#### b) タスク作成時の必須項目の明確化

```tsx
// 現在の問題: 何が必須か視覚的に不明確

// 改善案: 明確なステップ表示
<div className="space-y-6">
  {/* Step indicator */}
  <div className="flex items-center gap-2 text-sm">
    <span className={cn(
      "w-6 h-6 rounded-full flex items-center justify-center",
      selectedRepo ? "bg-green-600" : "bg-blue-600 animate-pulse"
    )}>1</span>
    <span className="text-gray-400">→</span>
    <span className={cn(
      "w-6 h-6 rounded-full flex items-center justify-center",
      hasModelsOrExecutor ? "bg-green-600" : "bg-gray-600"
    )}>2</span>
    <span className="text-gray-400">→</span>
    <span className={cn(
      "w-6 h-6 rounded-full flex items-center justify-center",
      instruction ? "bg-green-600" : "bg-gray-600"
    )}>3</span>
  </div>
</div>
```

---

### 3. フィードバックループの改善 🟠 High

**現状の問題:**

#### a) 実行中の進捗表示が不十分

- CLI 実行時に何が起きているか分からない
- 長時間実行時にユーザーが不安になる
- キャンセル可能かどうか不明

**改善案: プログレス表示の強化**

```
┌─────────────────────────────────────────────────────────────┐
│  🔄 Claude Code 実行中                         [キャンセル] │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ⏱️ 経過時間: 2:34                                          │
│                                                             │
│  📋 現在のステップ:                                         │
│  ├── ✓ ワークスペース準備                                   │
│  ├── ✓ コード分析                                          │
│  ├── 🔄 変更を生成中...                                     │
│  └── ○ パッチ作成                                          │
│                                                             │
│  💬 最新のログ:                                             │
│  > Analyzing src/components/Button.tsx                      │
│  > Found 3 areas to modify                                  │
│                                                             │
│  [ログを展開] [バックグラウンドで実行]                        │
└─────────────────────────────────────────────────────────────┘
```

#### b) Toast 通知の改善

現在のトースト通知は基本的ですが、アクション可能な通知に改善できます：

```tsx
// 改善案: アクション付きトースト

interface ToastAction {
  label: string;
  onClick: () => void;
}

// 使用例
success('PR #123 を作成しました', {
  action: {
    label: 'PR を見る',
    onClick: () => window.open(prUrl, '_blank'),
  },
});

error('実行に失敗しました', {
  action: {
    label: 'ログを確認',
    onClick: () => setActiveTab('logs'),
  },
});
```

---

### 4. タスク管理の効率化 🟡 Medium

**現状の問題:**

- サイドバーのタスク一覧が時系列のみ
- タスクの検索・フィルター機能がない
- 完了したタスクと進行中のタスクが混在

**改善案:**

```
サイドバー改善案:

┌──────────────────────────────────┐
│  🔍 タスクを検索...              │
├──────────────────────────────────┤
│  フィルター: [すべて ▼]          │
│                                  │
│  📌 ピン留め                      │
│  └── 🔄 API エンドポイント追加    │
│                                  │
│  🔄 進行中 (2)                   │
│  ├── バグ修正 #123               │
│  └── リファクタリング             │
│                                  │
│  ✅ 今日 (3)                     │
│  ├── テスト追加                   │
│  ├── ドキュメント更新             │
│  └── CI 修正                     │
│                                  │
│  📅 昨日 (5)                     │
│  └── [展開...]                   │
└──────────────────────────────────┘
```

**実装案:**

```tsx
// components/Sidebar/TaskFilters.tsx (新規)

type TaskFilter = 'all' | 'in_progress' | 'completed' | 'failed';

interface TaskGroup {
  label: string;
  tasks: Task[];
  icon: React.ReactNode;
}

function groupTasks(tasks: Task[]): TaskGroup[] {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = subDays(today, 1);
  
  return [
    {
      label: '進行中',
      tasks: tasks.filter(t => hasRunningRuns(t)),
      icon: <ArrowPathIcon className="animate-spin" />,
    },
    {
      label: '今日',
      tasks: tasks.filter(t => isAfter(t.updated_at, today)),
      icon: <CalendarIcon />,
    },
    {
      label: '昨日',
      tasks: tasks.filter(t => 
        isAfter(t.updated_at, yesterday) && isBefore(t.updated_at, today)
      ),
      icon: <CalendarIcon />,
    },
  ];
}
```

---

### 5. Diff ビューアの可読性向上 🟡 Medium

**現状の問題:**

- 行番号がない
- ファイル間のナビゲーションが困難
- シンタックスハイライトがない
- 大きな Diff の場合にスクロールが大変

**改善案:**

```
┌─────────────────────────────────────────────────────────────┐
│  📁 変更されたファイル (3)                    [全て展開/折畳]│
│  ├── src/components/Button.tsx  (+15, -3)     [展開 ▼]     │
│  ├── src/lib/utils.ts           (+5, -2)      [折畳 ▲]     │
│  └── tests/button.test.tsx      (+25, -0)     [展開 ▼]     │
├─────────────────────────────────────────────────────────────┤
│  src/components/Button.tsx                                  │
│  ─────────────────────────────────────────────────────────  │
│  @@ -10,6 +10,15 @@                                         │
│                                                             │
│   10 │   export function Button({ variant = 'primary' }) {  │
│   11 │     const styles = getButtonStyles(variant);         │
│  +12 │     const [isHovered, setIsHovered] = useState(false);│
│  +13 │                                                       │
│  +14 │     const handleMouseEnter = () => {                  │
│  +15 │       setIsHovered(true);                             │
│  +16 │     };                                                │
│   17 │                                                       │
│   18 │     return (                                          │
│                                                             │
│  [統合ビュー] [分割ビュー] [Raw パッチ]                       │
└─────────────────────────────────────────────────────────────┘
```

**実装案:**

```tsx
// components/DiffViewer/EnhancedDiffViewer.tsx (新規)

interface EnhancedDiffViewerProps {
  patch: string;
  viewMode?: 'unified' | 'split' | 'raw';
  showLineNumbers?: boolean;
  syntaxHighlight?: boolean;
  collapsible?: boolean;
}

// ファイルごとの折りたたみ状態管理
const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

// 行番号付きレンダリング
function renderLine(line: string, index: number) {
  const lineNumber = index + 1;
  return (
    <div className="flex">
      <span className="w-12 text-right pr-2 text-gray-600 select-none border-r border-gray-800">
        {lineNumber}
      </span>
      <span className={cn(
        "flex-1 pl-2",
        getLineClass(line)
      )}>
        {line}
      </span>
    </div>
  );
}
```

---

### 6. エラー状態の改善 🟡 Medium

**現状の問題:**

- エラーメッセージが技術的すぎる場合がある
- エラーからの復旧パスが不明確
- 一時的なエラーと致命的なエラーの区別がない

**改善案: エラータイプ別の UI**

```tsx
// lib/error-handling.ts (新規)

type ErrorType = 
  | 'network'        // 一時的なネットワークエラー
  | 'auth'           // 認証エラー
  | 'permission'     // 権限エラー
  | 'validation'     // 入力検証エラー
  | 'execution'      // 実行時エラー
  | 'rate_limit'     // API レート制限
  | 'unknown';       // 不明なエラー

interface ErrorDisplay {
  title: string;
  message: string;
  icon: React.ReactNode;
  actions: ErrorAction[];
  retryable: boolean;
}

const errorDisplayMap: Record<ErrorType, (error: Error) => ErrorDisplay> = {
  network: (error) => ({
    title: '接続エラー',
    message: 'サーバーに接続できませんでした。インターネット接続を確認してください。',
    icon: <WifiIcon />,
    actions: [{ label: '再試行', action: 'retry' }],
    retryable: true,
  }),
  auth: (error) => ({
    title: '認証エラー',
    message: 'セッションが期限切れです。再度ログインしてください。',
    icon: <LockClosedIcon />,
    actions: [{ label: 'ログイン', action: 'login' }],
    retryable: false,
  }),
  rate_limit: (error) => ({
    title: 'API制限に達しました',
    message: 'しばらく待ってから再試行してください。',
    icon: <ClockIcon />,
    actions: [{ label: '1分後に再試行', action: 'retry_delayed' }],
    retryable: true,
  }),
  // ...
};
```

**エラー表示コンポーネント:**

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ 実行に失敗しました                                       │
│                                                             │
│  Claude Code の実行中にエラーが発生しました。                  │
│                                                             │
│  詳細: APIレート制限に達しました                              │
│                                                             │
│  💡 ヒント:                                                  │
│  • 1分ほど待ってから再試行してください                         │
│  • または別のモデルを試してください                            │
│                                                             │
│  [30秒後に再試行] [別のモデルで実行] [詳細を見る]              │
└─────────────────────────────────────────────────────────────┘
```

---

### 7. キーボードショートカットの拡充 🟢 Low

**現状の問題:**

- `Cmd/Ctrl + Enter` で送信のみ
- パワーユーザー向けのショートカットがない
- ショートカット一覧がない

**改善案:**

```tsx
// lib/keyboard-shortcuts.ts (新規)

const shortcuts: Shortcut[] = [
  // グローバル
  { keys: 'mod+k', action: 'openCommandPalette', description: 'コマンドパレット' },
  { keys: 'mod+/', action: 'showShortcuts', description: 'ショートカット一覧' },
  { keys: 'mod+,', action: 'openSettings', description: '設定を開く' },
  
  // タスク作成
  { keys: 'mod+enter', action: 'submit', description: '送信' },
  { keys: 'mod+shift+enter', action: 'submitAndCreateNew', description: '送信して新規作成' },
  
  // タスク詳細
  { keys: 'mod+1', action: 'switchToSummary', description: 'サマリータブ' },
  { keys: 'mod+2', action: 'switchToDiff', description: 'Diff タブ' },
  { keys: 'mod+3', action: 'switchToLogs', description: 'ログタブ' },
  { keys: 'mod+p', action: 'createPR', description: 'PR を作成' },
  
  // ナビゲーション
  { keys: 'mod+n', action: 'newTask', description: '新規タスク' },
  { keys: 'mod+[', action: 'previousTask', description: '前のタスク' },
  { keys: 'mod+]', action: 'nextTask', description: '次のタスク' },
];
```

**ショートカット一覧モーダル:**

```
┌─────────────────────────────────────────────────────────────┐
│  ⌨️ キーボードショートカット                     [ESC で閉じる]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  グローバル                                                  │
│  ─────────────────────────────────────────────────────────  │
│  ⌘ K         コマンドパレット                               │
│  ⌘ /         ショートカット一覧                              │
│  ⌘ ,         設定を開く                                     │
│                                                             │
│  タスク作成                                                  │
│  ─────────────────────────────────────────────────────────  │
│  ⌘ ⏎         送信                                          │
│  ⌘ ⇧ ⏎       送信して新規作成                               │
│                                                             │
│  ナビゲーション                                              │
│  ─────────────────────────────────────────────────────────  │
│  ⌘ N         新規タスク                                     │
│  ⌘ [         前のタスク                                     │
│  ⌘ ]         次のタスク                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## インタラクションデザイン改善

### 1. マイクロインタラクション

**現状の問題:**
- ボタンクリック時のフィードバックが弱い
- 状態遷移がぎこちない

**改善案:**

```css
/* globals.css に追加 */

/* ボタンプレス効果 */
.button-press {
  transition: transform 0.1s ease-out;
}

.button-press:active {
  transform: scale(0.97);
}

/* カード選択アニメーション */
.card-selectable {
  transition: all 0.15s ease-out;
}

.card-selectable:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.card-selectable.selected {
  transform: translateY(0);
  box-shadow: inset 0 0 0 2px theme('colors.blue.500');
}

/* スケルトンローダーのパルス */
@keyframes skeleton-pulse {
  0%, 100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.8;
  }
}

.skeleton {
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  background: linear-gradient(
    90deg,
    theme('colors.gray.800') 0%,
    theme('colors.gray.700') 50%,
    theme('colors.gray.800') 100%
  );
  background-size: 200% 100%;
}
```

### 2. ドラッグ＆ドロップ

**将来的な改善案:**
- タスクの並べ替え
- ファイルのドラッグによる添付
- モデルの優先順位設定

```tsx
// 例: ファイル添付のドラッグ＆ドロップ
<div
  className={cn(
    "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
    isDragging 
      ? "border-blue-500 bg-blue-500/10" 
      : "border-gray-700 hover:border-gray-600"
  )}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
  <CloudArrowUpIcon className="w-12 h-12 text-gray-500 mx-auto mb-3" />
  <p className="text-gray-400">ファイルをドラッグ＆ドロップ</p>
  <p className="text-gray-500 text-sm mt-1">または クリックして選択</p>
</div>
```

---

## 情報アーキテクチャ改善

### 1. 設定画面の再構成

**現状の問題:**
- 設定がモーダルに集約されすぎている
- タブ間の関連性が不明確

**改善案:**

```
設定の階層構造:

設定
├── 接続
│   ├── GitHub App
│   └── API キー（モデル）
├── デフォルト
│   ├── リポジトリ
│   ├── ブランチ
│   └── PR 作成モード
└── 表示
    ├── テーマ（将来）
    └── 言語（将来）
```

### 2. タスク詳細画面のレイアウト

**現状:**
単一カラムのチャット風レイアウト

**改善案: 適応型レイアウト**

```
デスクトップ（lg以上）:
┌────────────────────────┬────────────────────────────────┐
│  チャット履歴           │  実行結果                       │
│                        │  ┌────────────────────────────┐│
│  [User] タスク指示      │  │ Summary │ Diff │ Logs     ││
│                        │  ├────────────────────────────┤│
│  [Claude Code] 実行中   │  │                            ││
│  └── プログレス表示     │  │  選択された Run の詳細     ││
│                        │  │                            ││
│  ──────────────────    │  │                            ││
│  [入力フィールド]       │  └────────────────────────────┘│
└────────────────────────┴────────────────────────────────┘

タブレット・モバイル:
┌──────────────────────────────────────────────────────────┐
│  [チャット] [結果]                                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  選択されたタブの内容                                      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## ビジュアルデザイン改善

### 1. 色彩システムの拡張

**現状の問題:**
- ダークモードのみ
- セマンティックカラーの一貫性が不十分

**改善案: CSS 変数化**

```css
/* globals.css */

:root {
  /* 背景 */
  --bg-primary: #030712;
  --bg-secondary: #111827;
  --bg-tertiary: #1f2937;
  --bg-elevated: #374151;
  
  /* テキスト */
  --text-primary: #f9fafb;
  --text-secondary: #d1d5db;
  --text-muted: #9ca3af;
  --text-disabled: #6b7280;
  
  /* ブランドカラー */
  --brand-primary: #2563eb;
  --brand-hover: #1d4ed8;
  --brand-light: #3b82f6;
  
  /* セマンティック */
  --success: #22c55e;
  --success-muted: rgba(34, 197, 94, 0.2);
  --error: #ef4444;
  --error-muted: rgba(239, 68, 68, 0.2);
  --warning: #f59e0b;
  --warning-muted: rgba(245, 158, 11, 0.2);
  --info: #3b82f6;
  --info-muted: rgba(59, 130, 246, 0.2);
  
  /* ボーダー */
  --border-default: #374151;
  --border-subtle: #1f2937;
  --border-focus: #2563eb;
}
```

### 2. タイポグラフィの統一

**改善案:**

```tsx
// lib/typography.ts

export const typography = {
  // 見出し
  h1: 'text-2xl font-bold text-gray-100',
  h2: 'text-xl font-semibold text-gray-100',
  h3: 'text-lg font-semibold text-gray-100',
  h4: 'text-base font-medium text-gray-200',
  
  // 本文
  body: 'text-sm text-gray-300',
  bodySmall: 'text-xs text-gray-400',
  
  // コード
  code: 'font-mono text-sm',
  codeSmall: 'font-mono text-xs',
  
  // ラベル
  label: 'text-sm font-medium text-gray-200',
  hint: 'text-xs text-gray-500',
  error: 'text-sm text-red-400',
} as const;
```

### 3. アイコンの一貫性

**現状:**
Heroicons を使用（良い選択）

**改善案:**
アイコン使用ガイドラインの策定

```tsx
// lib/icons.ts

// アイコンサイズの標準化
export const iconSizes = {
  xs: 'w-3 h-3',   // インライン、バッジ
  sm: 'w-4 h-4',   // ボタン内、リスト
  md: 'w-5 h-5',   // 単独のアイコンボタン
  lg: 'w-6 h-6',   // 見出し横
  xl: 'w-8 h-8',   // 空状態のイラスト
  '2xl': 'w-12 h-12', // 大きな空状態
} as const;

// 状態別アイコンマッピング
export const statusIcons = {
  success: CheckCircleIcon,
  error: ExclamationCircleIcon,
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon,
  loading: ArrowPathIcon,
  queued: ClockIcon,
} as const;
```

---

## 実装優先度マトリクス

| 改善項目 | 影響度 | 実装難易度 | 優先度 | 推奨フェーズ |
|---------|-------|-----------|-------|-------------|
| オンボーディングフロー | 高 | 中 | P0 | Phase 1 |
| エラー状態の改善 | 高 | 低 | P0 | Phase 1 |
| 実行中進捗表示 | 高 | 中 | P1 | Phase 1 |
| Executor 選択の簡略化 | 中 | 中 | P1 | Phase 1 |
| Toast 通知の改善 | 中 | 低 | P1 | Phase 1 |
| タスク検索・フィルター | 中 | 中 | P2 | Phase 2 |
| Diff ビューア強化 | 中 | 高 | P2 | Phase 2 |
| キーボードショートカット | 低 | 中 | P2 | Phase 2 |
| CSS 変数化 | 低 | 低 | P3 | Phase 3 |
| ダークモード以外のテーマ | 低 | 高 | P3 | Phase 3 |

---

## 次のステップ

1. **Phase 1 (2週間)**: オンボーディングとフィードバック改善
   - オンボーディングチェックリスト実装
   - エラー表示の改善
   - 実行中進捗の強化

2. **Phase 2 (2週間)**: 効率性の改善
   - タスク検索・フィルター
   - キーボードショートカット
   - Diff ビューア強化

3. **Phase 3 (1週間)**: ビジュアル統一
   - CSS 変数化
   - タイポグラフィ統一
   - アイコンガイドライン適用

---

## 関連ドキュメント

- [UI/UX Improvement Plan v1](./ui-ux-improvement.md) - 基礎的な改善項目
- [Architecture](./architecture.md) - システムアーキテクチャ
- [Development](./development.md) - 開発ガイドライン
