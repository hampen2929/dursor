# Breakdown Improvement v1 - Lineage機能の拡充

## 概要

このドキュメントでは、Task Breakdown機能の改善について記述します。主に以下の3つの機能追加を行います：

1. **Lineage機能の拡充** - 元ドキュメントとタスクの関係性追跡
2. **バックグラウンド実行** - 他の作業を妨げない非同期実行
3. **Backlog統合機能** - 類似タスクのマージと履歴追跡

---

## 1. Lineage機能の拡充

### 1.1 背景と課題

現在のBreakdown機能では、入力したテキストから生成されたBacklogItemは作成されるが、以下の情報が失われている：

- 元となったドキュメント（入力テキスト）自体が保存されない
- どのBacklogItemがどのBreakdownから生成されたか追跡できない
- タスクの起源を後から確認できない

### 1.2 解決策

#### 新規エンティティ: BreakdownSession

Breakdownの実行セッションを永続化し、入力ドキュメントと生成されたBacklogItemを紐付ける。

```
BreakdownSession
├── id (UUID)
├── repo_id (FK → repos)
├── source_document (TEXT) ← 入力テキスト全文
├── source_document_hash (TEXT) ← 重複検出用
├── executor_type (ENUM)
├── codebase_analysis (JSON) ← 解析結果
├── summary (TEXT) ← 生成サマリー
├── status (ENUM: pending, running, succeeded, failed)
├── error_message (TEXT)
├── created_at (TIMESTAMP)
└── completed_at (TIMESTAMP)
```

#### BacklogItemへのLineage追加

```
BacklogItem (既存)
├── ... (既存フィールド)
├── breakdown_session_id (FK → breakdown_sessions) ← 新規追加
└── source_excerpt (TEXT) ← 該当する元テキストの抜粋（オプション）
```

### 1.3 データモデル

#### Python Domain Models

```python
# domain/models.py

class BreakdownSession(BaseModel):
    """Breakdownセッションの永続化モデル"""
    id: str
    repo_id: str
    source_document: str  # 入力テキスト全文
    source_document_hash: str  # SHA-256ハッシュ
    executor_type: ExecutorType
    codebase_analysis: CodebaseAnalysis | None
    summary: str | None
    status: BreakdownStatus
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None

class BacklogItem(BaseModel):
    """既存モデルの拡張"""
    # ... 既存フィールド
    breakdown_session_id: str | None  # 新規追加
    source_excerpt: str | None  # 新規追加
```

#### TypeScript Types

```typescript
// types.ts

export interface BreakdownSession {
  id: string;
  repo_id: string;
  source_document: string;
  source_document_hash: string;
  executor_type: ExecutorType;
  codebase_analysis: CodebaseAnalysis | null;
  summary: string | null;
  status: BreakdownStatus;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface BacklogItem {
  // ... 既存フィールド
  breakdown_session_id: string | null;  // 新規追加
  source_excerpt: string | null;  // 新規追加
}
```

### 1.4 DBスキーマ

```sql
-- breakdown_sessions テーブル
CREATE TABLE IF NOT EXISTS breakdown_sessions (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    source_document TEXT NOT NULL,
    source_document_hash TEXT NOT NULL,
    executor_type TEXT NOT NULL,
    codebase_analysis TEXT,  -- JSON
    summary TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_breakdown_sessions_repo_id ON breakdown_sessions(repo_id);
CREATE INDEX IF NOT EXISTS idx_breakdown_sessions_status ON breakdown_sessions(status);
CREATE INDEX IF NOT EXISTS idx_breakdown_sessions_source_hash ON breakdown_sessions(source_document_hash);

-- backlog_items テーブルへのカラム追加
ALTER TABLE backlog_items ADD COLUMN breakdown_session_id TEXT REFERENCES breakdown_sessions(id) ON DELETE SET NULL;
ALTER TABLE backlog_items ADD COLUMN source_excerpt TEXT;

CREATE INDEX IF NOT EXISTS idx_backlog_items_breakdown_session ON backlog_items(breakdown_session_id);
```

### 1.5 API エンドポイント

```
# Breakdown Sessions
GET    /v1/breakdown-sessions              # セッション一覧
GET    /v1/breakdown-sessions/{id}         # セッション詳細
GET    /v1/breakdown-sessions/{id}/items   # セッションから生成されたBacklogItem一覧
DELETE /v1/breakdown-sessions/{id}         # セッション削除（BacklogItemは残る）

# 既存エンドポイントの拡張
POST   /v1/breakdown                       # BreakdownSession作成 & 実行開始
GET    /v1/breakdown/{id}                  # → /v1/breakdown-sessions/{id} にリダイレクト

# Backlog (Lineage情報付き)
GET    /v1/backlog/{id}/lineage            # BacklogItemの起源情報を取得
```

### 1.6 Lineage情報取得レスポンス例

```json
// GET /v1/backlog/{id}/lineage
{
  "backlog_item": {
    "id": "backlog-123",
    "title": "ダークモード対応",
    // ...
  },
  "breakdown_session": {
    "id": "session-456",
    "source_document": "以下の機能を実装してください...",
    "executor_type": "claude_code",
    "created_at": "2024-01-15T10:00:00Z"
  },
  "source_excerpt": "ダークモードの実装: ユーザーが...",
  "sibling_items": [
    {"id": "backlog-124", "title": "ライトモードのデフォルト設定"},
    {"id": "backlog-125", "title": "テーマ切り替えアニメーション"}
  ]
}
```

### 1.7 UI変更

#### Backlogカード

- 「元ドキュメント」アイコン追加
- クリックでLineage情報モーダル表示

#### Lineage情報モーダル

```
┌─────────────────────────────────────────────┐
│  📄 Lineage Information                      │
├─────────────────────────────────────────────┤
│  Origin Document                             │
│  ┌─────────────────────────────────────┐    │
│  │ 以下の機能を実装してください：         │    │
│  │ 1. ダークモード対応                   │    │
│  │ 2. ユーザー設定の永続化               │    │
│  │ ...                                 │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  Generated: 2024-01-15 10:00                 │
│  Executor: Claude Code                       │
│                                              │
│  Related Items (from same breakdown):        │
│  • ライトモードのデフォルト設定              │
│  • テーマ切り替えアニメーション              │
│                                              │
│                          [Close]             │
└─────────────────────────────────────────────┘
```

---

## 2. バックグラウンド実行

### 2.1 背景と課題

現在の実装でもバックエンドは非同期実行されているが、フロントエンドのBreakdownModalがモーダルUIであるため、ユーザーは実行完了まで他の作業ができない。

### 2.2 解決策

#### 実行中セッションのグローバル状態管理

```typescript
// stores/breakdownStore.ts (新規)

interface BreakdownStore {
  runningSessions: Map<string, {
    sessionId: string;
    repoId: string;
    repoName: string;
    status: BreakdownStatus;
    progress: number;  // 0-100
    startedAt: Date;
  }>;

  startSession(sessionId: string, repoId: string, repoName: string): void;
  updateSession(sessionId: string, status: BreakdownStatus, progress: number): void;
  removeSession(sessionId: string): void;
}
```

#### UIの変更

1. **BreakdownModalの軽量化**
   - 実行開始後すぐにモーダルを閉じる
   - 「バックグラウンドで実行中」トースト通知

2. **グローバルステータスインジケーター**
   - ヘッダーに実行中セッション数のバッジ表示
   - クリックでドロップダウン表示（実行状況一覧）

3. **Backlogページへの統合**
   - 実行中のBreakdownセッションをカード形式で表示
   - リアルタイムログ表示（展開可能）

```
┌─────────────────────────────────────────────┐
│  🔄 Running Breakdown                        │
│  Repository: my-org/my-repo                 │
│  Started: 2 minutes ago                     │
│  ┌─────────────────────────────────────┐    │
│  │ > Analyzing codebase structure...    │    │
│  │ > Found 142 files                   │    │
│  │ > Generating task breakdown...      │    │
│  └─────────────────────────────────────┘    │
│  [View Logs] [Cancel]                        │
└─────────────────────────────────────────────┘
```

### 2.3 通知システム

```typescript
// 完了時の通知
interface BreakdownNotification {
  type: 'success' | 'error';
  sessionId: string;
  repoName: string;
  message: string;
  itemCount?: number;  // 成功時のみ
  action?: {
    label: string;
    href: string;
  };
}
```

完了時のトースト例：
```
✅ Breakdown completed
   my-org/my-repo - 5 items created
   [View Backlog →]
```

---

## 3. Backlog統合機能

### 3.1 背景と課題

異なるBreakdownセッションから類似したBacklogItemが生成されることがある。これらを手動で整理する負担を軽減したい。

### 3.2 解決策

#### 統合履歴の追跡

新規エンティティ: BacklogMergeHistory

```
BacklogMergeHistory
├── id (UUID)
├── merged_into_id (FK → backlog_items) ← 統合先
├── merged_from_ids (JSON array) ← 統合元のID一覧
├── merged_from_snapshots (JSON array) ← 統合元のスナップショット
├── merge_reason (TEXT) ← 統合理由
├── merged_at (TIMESTAMP)
└── merged_by (TEXT) ← 'user' or 'auto'
```

#### BacklogItemへのマージ情報追加

```
BacklogItem (既存)
├── ... (既存フィールド)
├── merged_from_count (INTEGER) ← 統合された件数
└── is_merged_away (BOOLEAN) ← 他に統合されたか（論理削除フラグ）
```

### 3.3 DBスキーマ

```sql
-- backlog_merge_history テーブル
CREATE TABLE IF NOT EXISTS backlog_merge_history (
    id TEXT PRIMARY KEY,
    merged_into_id TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
    merged_from_ids TEXT NOT NULL,  -- JSON array
    merged_from_snapshots TEXT NOT NULL,  -- JSON array of full BacklogItem objects
    merge_reason TEXT,
    merged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    merged_by TEXT NOT NULL DEFAULT 'user'
);

CREATE INDEX IF NOT EXISTS idx_merge_history_merged_into ON backlog_merge_history(merged_into_id);

-- backlog_items へのカラム追加
ALTER TABLE backlog_items ADD COLUMN merged_from_count INTEGER DEFAULT 0;
ALTER TABLE backlog_items ADD COLUMN is_merged_away BOOLEAN DEFAULT FALSE;
```

### 3.4 統合API

```
# 手動統合
POST /v1/backlog/merge
{
  "target_id": "backlog-123",      // 統合先
  "source_ids": ["backlog-124", "backlog-125"],  // 統合元
  "merge_reason": "同一機能の重複"  // オプション
}

# 統合候補の提案（AI支援）
POST /v1/backlog/suggest-merges
{
  "repo_id": "repo-123",
  "threshold": 0.7  // 類似度閾値（0-1）
}

Response:
{
  "suggestions": [
    {
      "items": ["backlog-123", "backlog-124"],
      "similarity": 0.85,
      "reason": "Both items relate to user authentication flow"
    }
  ]
}

# 統合履歴の取得
GET /v1/backlog/{id}/merge-history
```

### 3.5 類似度判定ロジック

```python
# services/backlog_similarity_service.py

class BacklogSimilarityService:
    """BacklogItem間の類似度を計算するサービス"""

    async def calculate_similarity(
        self,
        item1: BacklogItem,
        item2: BacklogItem
    ) -> float:
        """
        類似度を0-1で返す

        考慮する要素:
        - タイトルの類似度 (TF-IDF or embedding)
        - descriptionの類似度
        - target_filesの重複
        - tagsの重複
        - typeの一致
        """
        pass

    async def find_similar_items(
        self,
        repo_id: str,
        threshold: float = 0.7
    ) -> list[SimilarityGroup]:
        """
        リポジトリ内の類似BacklogItemをグルーピング
        """
        pass
```

### 3.6 統合フロー

```
1. ユーザーが統合候補を確認
   ┌─────────────────────────────────────────────┐
   │  Merge Suggestions                          │
   │                                              │
   │  📦 Similar items detected (85% match)      │
   │  ┌──────────────────┐ ┌──────────────────┐  │
   │  │ ダークモード対応  │ │ テーマ切替機能   │  │
   │  │ from: Session A  │ │ from: Session B  │  │
   │  └──────────────────┘ └──────────────────┘  │
   │                                              │
   │  [Merge] [Ignore] [View Details]            │
   └─────────────────────────────────────────────┘

2. 統合先を選択
   ┌─────────────────────────────────────────────┐
   │  Select merge target                        │
   │                                              │
   │  ○ ダークモード対応 (Keep this)             │
   │  ○ テーマ切替機能 (Keep this)               │
   │  ○ Create new merged item                   │
   │                                              │
   │  [Confirm Merge]                            │
   └─────────────────────────────────────────────┘

3. 統合完了
   - 統合元は is_merged_away = true になる
   - 統合先の merged_from_count が更新される
   - backlog_merge_history にレコード追加
```

### 3.7 統合後のLineage表示

統合されたItemには、元のLineage情報も保持される：

```json
// GET /v1/backlog/{merged_item_id}/lineage
{
  "backlog_item": { /* 統合後のItem */ },
  "breakdown_session": { /* 直接の親Session */ },
  "merged_from": [
    {
      "original_item": { /* 統合前のItemスナップショット */ },
      "breakdown_session": { /* 元のSession */ }
    },
    // ...
  ]
}
```

---

## 4. 実装優先度

### Phase 1: Lineage基盤 (必須)

1. BreakdownSessionテーブル作成
2. BacklogItemへのbreakdown_session_id追加
3. BreakdownService修正（Session永続化）
4. Lineage APIエンドポイント追加

### Phase 2: バックグラウンド実行 (必須)

1. BreakdownStore実装
2. BreakdownModal修正（即時クローズ）
3. グローバルステータスインジケーター
4. 完了通知システム

### Phase 3: 統合機能 (推奨)

1. BacklogMergeHistoryテーブル作成
2. 手動統合API
3. 統合UI
4. 統合後Lineage表示

### Phase 4: AI支援統合 (オプション)

1. 類似度計算サービス
2. 統合候補提案API
3. 提案UI

---

## 5. マイグレーション計画

### 既存データの扱い

1. 既存のBacklogItemには `breakdown_session_id = NULL` が設定される
2. 今後のBreakdownからは必ずSessionが作成される
3. 既存データは「起源不明」として表示（UI上で明示）

### 後方互換性

- 既存APIは変更なし（新規フィールドはオプション）
- フロントエンドは段階的に新UI移行

---

## 6. 関連ファイル

### 変更が必要なファイル

**Backend:**
- `apps/api/src/dursor_api/storage/schema.sql`
- `apps/api/src/dursor_api/domain/models.py`
- `apps/api/src/dursor_api/domain/enums.py`
- `apps/api/src/dursor_api/storage/dao.py`
- `apps/api/src/dursor_api/services/breakdown_service.py`
- `apps/api/src/dursor_api/routes/breakdown.py`
- `apps/api/src/dursor_api/routes/backlog.py`

**Frontend:**
- `apps/web/src/types.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/components/BreakdownModal.tsx`
- `apps/web/src/components/BacklogCard.tsx`
- `apps/web/src/app/backlog/page.tsx`

### 新規作成ファイル

**Backend:**
- `apps/api/src/dursor_api/services/backlog_similarity_service.py`
- `apps/api/src/dursor_api/routes/breakdown_sessions.py`

**Frontend:**
- `apps/web/src/stores/breakdownStore.ts`
- `apps/web/src/components/LineageModal.tsx`
- `apps/web/src/components/MergeSuggestionCard.tsx`
- `apps/web/src/components/GlobalBreakdownIndicator.tsx`
