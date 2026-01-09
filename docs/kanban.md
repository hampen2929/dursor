# Kanban（看板）ページ 実装に向けた調査と計画

## 背景 / 目的

現状の dursor は「Task（会話単位）」「Run（実行単位）」「PR（Pull Request）」を中心に UI/API が構成されていますが、Task を俯瞰して進捗管理する **Kanban（看板）ページ** は未実装です。

本ドキュメントでは、要件として提示された 6 列（Backlog / ToDo / InProgress / InReview / Done / Archived）を実現するために、

- 現状のデータモデルで **何が判定できる/できないか**
- 追加で必要な **DB/API/フロント実装**
- 状態遷移（自動/手動）とエッジケース

を整理し、実装計画を提示します。

## 要件（列の定義）

- **Backlog**
- **ToDo**
- **InProgress**
  - AIが実装している状態（Run が動いている）
- **InReview**
  - AIが実装して人間の反応待ち（AI側は完了しており、人間がレビュー/指示待ち）
- **Done**
  - Taskに紐づくPRがマージされた状態
- **Archived**
  - Taskに紐づくPRがマージされず、Taskが人間によって明示的にArchiveされた状態

## 現状調査（実装/データモデル）

### 現状の主要エンティティ

- **Task**
  - DB: `tasks(id, repo_id, title, created_at, updated_at)` のみ
  - **Task自体の状態（kanban列）を保持するカラムが存在しない**
- **Run**
  - `status`: `queued | running | succeeded | failed | canceled`
  - CLI executor（Claude/Codex/Gemini）では Run 完了時に commit/push まで行い `commit_sha` を保持
- **PR**
  - DB: `prs.status` は `TEXT` で、作成時に **固定で `"open"`** が保存される
  - **GitHub 側のマージ状態（merged）を取得してDBへ反映する仕組みが未実装**

### フロントの現状

- `/`（Home）: Task作成→最初の message 追加→Run 作成までを一気に実行して `/tasks/[taskId]` に遷移
- `/tasks/[taskId]`: Chat + Runs + PR（作成/更新）を扱う詳細画面
- Sidebar: Task の一覧（`tasksApi.list()`）のみ
- **Kanbanページ/ルートは未実装**

## ギャップ整理（要件に対して不足している点）

### 1) Backlog と ToDo の区別が現状はできない

現状の Task には状態が無く、Run/PR からの推定だけでは「Backlog vs ToDo（人間がこれから着手する優先度）」を区別できません。

➡ **手動で並べ替え/列移動できる “Taskのkanban状態” を永続化する必要がある**。

### 2) Archived は “人間による明示操作” が必須

Archived は「マージされず、人間が明示的にArchive」のため、推定ではなく **操作履歴（フラグ/状態）** が必要です。

### 3) Done は “PRがマージされた” 判定が必要

Done は PR の `merged`（または `merged_at != null`）を元に判定する必要がありますが、現状は DB に `open` を保存するだけで、

- PR が GitHub 上で close/merge されても DB が更新されない

➡ **PR ステータスの同期（GitHub API からの取得 → DB 反映）** が必要です。

## 提案する状態モデル（KanbanStatus）

### 方針

- **Kanban列は Task に紐づく状態として永続化**（手動操作・Archive に対応）
- ただし一部は **自動遷移**（Run 実行中/完了、PR マージ）で上書きされる
- 例外として **Archived は最優先**（Archived の Task は自動遷移しない）

### 状態（列）一覧

`KanbanStatus`:

- `backlog`
- `todo`
- `in_progress`
- `in_review`
- `done`
- `archived`

### 判定/遷移ルール（推奨）

優先度の高い順に判定（上から順に当てる）:

1. **Archived**
   - `task.kanban_status == archived`
2. **Done**
   - Task に紐づく PR のいずれかが GitHub 上で merged
3. **InProgress**
   - Task の最新 Run（または未完了 Run）が `queued` または `running`
4. **InReview**
   - Task に “完了（succeeded）” Run が存在し、人間側の次アクション待ち
   - 例: `latest_run.status == succeeded` かつ Done でも Archived でもない
5. **ToDo / Backlog**
   - 上記に該当せず、人間が手動で `todo` / `backlog` を選ぶ

補足:

- `failed/canceled` の Run は、基本的に Task を自動で `todo` に戻す（再実行待ち）か、直前の `backlog/todo` を保持する（選択式）

## DB変更案（最小）

### tasks テーブル拡張

`tasks` に以下を追加する案（v0.1の最小改修）:

- `kanban_status TEXT NOT NULL DEFAULT 'backlog'`
- `archived_at TEXT NULL`（`kanban_status=archived` の補助）
- `done_at TEXT NULL`（`kanban_status=done` の補助）

これにより以下を実現:

- Backlog / ToDo / Archived の **明示状態**
- Done の **確定状態**（PR merged と同期して更新）

### prs テーブル拡張（推奨）

PR マージ判定・同期のため、最低限以下のどちらか:

- 案A: `prs.status` を `open|closed|merged` に正規化して更新
- 案B: `prs.merged_at TEXT NULL` を追加（GitHubの merged_at を保存）

※ 案B の方が GitHub の情報を忠実に保存しやすいです。

## API 変更案

### 1) Kanban用の一覧取得

現状の `GET /v1/tasks` は Task のみで、Run/PR 状態が分からないため Kanban のカード表示に不足があります。

以下いずれかの方針:

- **方針A（推奨）**: Kanban 専用エンドポイント
  - `GET /v1/kanban?repo_id=...`
  - 返却: 各列ごとのカード配列、または `cards[]` + `status` を持たせる
- 方針B: `GET /v1/tasks?include=kanban` のような拡張

カードに含めたい最低限の情報例:

- `task.id`, `task.title`, `task.repo_id`, `task.updated_at`
- `task.kanban_status`（確定状態）
- `latest_run_status`（queued/running/succeeded/failed/canceled）
- `latest_pr_status`（open/closed/merged）と `pr_url`（あれば）

### 2) 手動の列移動（Backlog/ToDo など）

- `PATCH /v1/tasks/{task_id}/kanban`
  - body: `{ "kanban_status": "backlog" | "todo" | "archived" }`
  - ガード:
    - `done` は原則 GitHub の merged でのみ到達（手動で done にしない）
    - `archived` は明示操作のみ

### 3) Archive / Unarchive（専用でも可）

UX 的に明示アクションが分かりやすいので分けてもよい:

- `POST /v1/tasks/{task_id}/archive`
- `POST /v1/tasks/{task_id}/unarchive`（必要なら）

### 4) PR 状態同期（Done判定の前提）

Done の判定には GitHub 上の PR 情報が必要です。
現状の `GitHubService` には PR の詳細取得（`GET /repos/{owner}/{repo}/pulls/{number}`）がないため追加します。

提案:

- `POST /v1/tasks/{task_id}/prs/{pr_id}/refresh`
  - GitHub API から `state`, `merged`, `merged_at` を取得し `prs` を更新
  - merged の場合は Task を `done` に更新

または Kanban 一覧取得時に明示フラグで同期:

- `GET /v1/kanban?refresh_pr_status=true`
  - 表示対象の PR を必要な範囲で同期（レート制限・キャッシュ必須）

## サービス層の変更案（自動遷移）

### Run 起点の自動遷移

- Run 作成時:
  - Task が `archived` / `done` でなければ `in_progress`
- Run 完了時:
  - `succeeded`: `in_review`（ただし `done` / `archived` なら維持）
  - `failed` / `canceled`: `todo` に戻す（または直前の `backlog/todo` を維持）

### PR 起点の自動遷移

- PR 作成時:
  - Task を `in_review`（すでに `in_review` なら維持）
- PR merged 同期時:
  - PR を `merged`（または `merged_at` を保存）
  - Task を `done`（`archived` の場合は原則変更しない / 仕様で禁止）

## UI/UX 設計（看板ページ）

### ルーティング

- `apps/web/src/app/kanban/page.tsx` を追加（例）
- Sidebar もしくは上部ナビに「Kanban」導線を追加

### 画面構成（最低限）

- 上部:
  - Repo フィルタ（任意：現状は Task が全Repo混在し得る）
  - 更新ボタン（PRステータス同期を走らせる場合）
- 本体:
  - 6 列（Backlog / ToDo / InProgress / InReview / Done / Archived）
  - 各列に Task カードを表示

カード表示の例:

- タイトル（`task.title`）
- 最終更新（`task.updated_at`）
- 直近 Run の状態（あれば）
- PR リンク（あれば）
- クイックアクション:
  - `Open`（`/tasks/{id}`へ）
  - `Archive`（Backlog/ToDo/InReview 等から）

### 操作

- **ドラッグ&ドロップで列移動**（Backlog⇄ToDo、ToDo→InProgress など）
  - 実装コストを抑えるなら「ドロップダウンで状態変更」でも可
- `InProgress` / `Done` は基本自動（UI では移動不可、または移動時に警告）

### “InProgress / InReview” の表示整合性

実運用でブレやすい点:

- Task が `todo` でもユーザーが手動で Run を作ると即 `in_progress` にしたい
- Run が完了しても PR を作らない運用があり得る → `in_review` のまま

➡ “kanban_status を絶対視する” というより、**自動遷移が必要な状態（in_progress/in_review/done）を優先して上書き**する設計が安全。

## エッジケース設計

### 1) Task に PR が複数存在する

現状モデル上は `Task -> PRs (1:N)` です。

- Done 判定: **いずれかが merged なら Done**（要件に合う）
- 表示: 最新 PR を表示しつつ「PR x件」などの情報を持たせる（任意）

### 2) PR が close（未マージ）になった

要件上は Done ではないため:

- `closed` を保存
- Task は `in_review` のまま（人間の判断待ち） or `todo` に戻す（再実装/再PR作成待ち）
  - 推奨: `in_review`（理由: “人間が次にどうするか決める” 状態）

### 3) Archived と Done の競合

要件: Archived は「マージされず、明示的にArchive」。

推奨ルール:

- `archived` の Task は **PR status 同期で merged を検知しても done へ自動移動しない**
  - あるいは「merged を検知したら archived を解除して done にする」でも良いが、要件文に忠実なら前者

### 4) Task 作成フローとの整合（Backlogを作れるか）

現状 Home は Task 作成後に即 Run を作るため、ほぼ `in_progress` になります。
Backlog/ToDo を有効活用するには追加導線が必要:

- 「Taskだけ作る（Runを作らない）」ボタン
- Breakdown で生成された複数 Task を `backlog` で作成（既に Task Bulk Create があるため相性が良い）

## 実装ステップ案（段階的）

### Phase 1: 設計の土台（DB/型/API最小）

- DB: `tasks.kanban_status`, `tasks.archived_at`, `tasks.done_at` を追加
- Backend:
  - `KanbanStatus` enum を追加（Python/TS）
  - Task の kanban 更新 API（`PATCH /tasks/{id}/kanban`）
  - Kanban 一覧 API（`GET /kanban` か `GET /tasks?include=...`）
- Frontend:
  - `Kanban` ページを新規追加（列 + カード表示、手動移動はドロップダウンでOK）

### Phase 2: 自動遷移（InProgress/InReview）

- Run 作成/完了のタイミングで Task の kanban_status を更新
  - `RunService.create_runs()` で `in_progress`
  - Run 完了（DAO更新後）で `in_review` 等

### Phase 3: PR同期 & Done

- `GitHubService` に PR詳細取得 API を追加
  - `GET /repos/{owner}/{repo}/pulls/{number}`
- PR の `merged` を DB に反映し、Task を `done` に更新
  - on-demand（手動Refresh）を先に入れるのが安全
  - 後で定期同期（バックグラウンド）を追加

### Phase 4: UX強化（Drag&Drop、フィルタ、集計）

- DnD による列移動
- Repo フィルタ
- “Done/Archived を折りたたむ” 等の可視性改善

## テスト方針（最小）

- Backend:
  - Task の kanban_status 更新 API のバリデーション（done を禁止等）
  - status 判定関数（Run/PR から列が決まる部分）のユニットテスト
- Frontend:
  - 表示（列にカードが入る）と、ステータス更新操作の E2E/簡易テスト（可能なら）

## まとめ

Kanban を成立させるには、現状の「Taskに状態が無い」「PRのmerged判定が同期されない」という2点を補う必要があります。
その上で、Backlog/ToDo/Archived のような **人間の意思** と、InProgress/InReview/Done のような **実行結果/PR状態** の両方を扱えるよう、Taskに `kanban_status` を永続化しつつ、自動遷移（特に Run と PR merged）を組み合わせる設計を推奨します。

