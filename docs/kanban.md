# カンバンボード実装計画

## 概要
タスク管理を効率化するために、カンバンボード機能を実装します。
以下のステータスでタスクを管理します。

## ステータス定義
- **Backlog**: 未着手のタスク
- **ToDo**: 着手予定のタスク
- **InProgress**: AIが実装中のタスク
- **InReview**: AIの実装が完了し、人間の確認待ちの状態
- **Done**: Taskに紐づくPRがマージされた状態
- **Archived**: Taskに紐づくPRがマージされず、Taskが人間によって明示的にArchiveされた状態

## 実装計画

### 1. バックエンド (apps/api)

#### 1.1 データモデルの変更
- `apps/api/src/dursor_api/domain/enums.py`
  - `TaskStatus` Enumを追加
    ```python
    class TaskStatus(str, Enum):
        BACKLOG = "backlog"
        TODO = "todo"
        IN_PROGRESS = "in_progress"
        IN_REVIEW = "in_review"
        DONE = "done"
        ARCHIVED = "archived"
    ```

- `apps/api/src/dursor_api/domain/models.py`
  - `Task` モデルに `status: TaskStatus` フィールドを追加 (デフォルト: `TaskStatus.BACKLOG`)
  - `TaskCreate` モデルには含めず、作成時はデフォルトで `BACKLOG` とする（あるいは `ToDo` にするか検討）

#### 1.2 データベーススキーマの変更
- `apps/api/src/dursor_api/storage/schema.sql`
  - `tasks` テーブルに `status` カラムを追加
    ```sql
    status TEXT NOT NULL DEFAULT 'backlog'
    ```

#### 1.3 DAOとサービスの更新
- `apps/api/src/dursor_api/storage/dao.py`
  - `TaskDao` の `create` メソッドで `status` を保存するように更新
  - `TaskDao` に `update_status(task_id: str, status: TaskStatus)` メソッドを追加
  - `TaskDao` の `list` メソッドでステータスによるフィルタリングをサポート（必要であれば）

- `apps/api/src/dursor_api/services/task_service.py` (もしあれば)
  - ステータス更新ロジックの追加

#### 1.4 APIエンドポイントの更新/追加
- `apps/api/src/dursor_api/routes/tasks.py`
  - `PATCH /v1/tasks/{id}` エンドポイントを追加し、ステータス更新を可能にする
  - `TaskUpdate` モデルの作成

### 2. フロントエンド (apps/web)

#### 2.1 型定義の更新
- `apps/web/src/types.ts`
  - `TaskStatus` 型定義を追加
  - `Task` インターフェースに `status` プロパティを追加

#### 2.2 APIクライアントの更新
- `apps/web/src/lib/api.ts`
  - `tasksApi.updateStatus(taskId: string, status: TaskStatus)` メソッドを追加

#### 2.3 カンバンページの実装
- `apps/web/src/app/kanban/page.tsx` の作成
  - カラムごとのタスク表示
  - ドラッグ＆ドロップによるステータス変更（`@dnd-kit/core` などを利用推奨、あるいは簡易的なSelect/Buttonでの移動）
    - 今回は実装の容易さとメンテナンス性を考慮し、まずは各カード内のドロップダウンまたはボタンでの移動、あるいはシンプルなカラム表示から始める。DnDは `dnd-kit` があれば使う。

#### 2.4 サイドバーの更新
- `apps/web/src/components/Sidebar.tsx`
  - "Kanban" リンクを追加

### 3. 自動ステータス更新ロジック (Optional / Future)
- AIの実装開始時に `InProgress` に変更
- PR作成時に `InReview` に変更
- PRマージ時に `Done` に変更
- ※ 今回は手動変更を主とするが、フックポイントがあれば実装する

## タスクリスト
- [ ] バックエンド: Enumとモデルの定義
- [ ] バックエンド: DBスキーマ更新
- [ ] バックエンド: DAOの更新
- [ ] バックエンド: APIエンドポイントの実装
- [ ] フロントエンド: 型定義とAPIクライアント更新
- [ ] フロントエンド: カンバンページの作成
- [ ] フロントエンド: サイドバーへのリンク追加
