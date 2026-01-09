# タスク分解（Backlog化）v2 調査・改善計画

## 目的

`docs/task-split.md` で実装した「文章→タスク分解（Breakdown）→一括登録」を、以下の2点を満たす形にアップデートする。

- **Taskの粒度が小さすぎる問題を解消する**
  - 例: 「黒だけでなく白い画面も使えるようにしたい」に対して数十個のTaskは過剰
  - イメージは **ユーザーの機能リクエスト1件につき1 Task**（= “会話して実装を進める単位”）
- **登録後にサイドバーに増えるだけの体験を改善する**
  - Breakdown結果は “Task一覧（サイドバー）” ではなく、**Backlogとして別ページで管理**する
  - Backlogページで、既存Backlog一覧表示と、文章からBacklog（/ Task候補）へ分解する機能を提供する

---

## v1（現状実装）調査メモ

### 何が入っているか（コード上の事実）

- **API**
  - `POST /v1/breakdown`（実体は `/breakdown`）で分解を開始し、すぐ `breakdown_id` を返す（202）
  - `GET /v1/breakdown/{breakdown_id}` で結果取得（polling）
  - `GET /v1/breakdown/{breakdown_id}/logs` でログをポーリング（疑似ストリーミング）
- **実装**
  - `apps/api/src/dursor_api/services/breakdown_service.py`
    - CLI executor（Claude Code / Codex / Gemini）を使い、`.dursor-breakdown.json` を作らせてパース
    - プロンプトは「各タスクは独立実行可能」「target_files は実在」「implementation_hint を具体的に」など、**細粒度化を促すルール**が強い
  - `apps/api/src/dursor_api/routes/tasks.py`
    - `POST /tasks/bulk` でタイトルのみを複数作る（descriptionはDBに保存されない設計）
- **UI**
  - `apps/web/src/components/BreakdownModal.tsx`
    - Sidebarの `Breakdown` ボタン→モーダルで要件を入力→解析→結果のタスクを選択→ `POST /tasks/bulk`
    - タスク登録後は `mutate('tasks')` によりサイドバーのタスク一覧が更新される
  - `apps/web/src/components/Sidebar.tsx`
    - `tasksApi.list()` を定期ポーリングし、最大50件を表示

### v1の体験が「過剰に細かいタスク」を生みやすい理由（推定）

- プロンプトが **「独立実行可能な単位」** を強く求めるため、LLM/CLI agent が “実装作業分解（subtask化）” をやりがち
- `target_files` や `implementation_hint` を求めるため、自然に「実装ステップ」が細分化されやすい
- UIも「分解結果=作るTask」という導線のため、ユーザーが “Backlogとして保管” ではなく “今すぐ大量登録” しやすい

---

## v2 の設計方針（結論）

### 1) “Task” と “Backlog” を分離する

- **Backlog**: 文章から抽出した「やること候補」の一覧・保管場所（計画/棚卸し）
- **Task**: 実行（会話・Run・PR作成）を進める単位（既存の Task エンティティ）

> v2では「Breakdownで作るのは原則 Backlog Item（= Task候補）」に寄せ、Task（会話単位）は “着手時に作る” 方向にする。

### 2) 分解のデフォルト粒度を “ユーザー要望1件=1項目” にする

- “実装の手順” ではなく “成果物/ユーザー価値” を単位にまとめる
- 例: 「白い画面も使えるようにしたい」→
  - ✅ Backlog Item: 「テーマ切替（ライトテーマ対応）」の1件
  - （必要なら）中身に “サブ項目/検討事項” は書くが、**複数Taskを量産しない**

### 3) ただし “深掘り” はできるようにする（任意）

- Backlog Itemを選んで、必要なら後から
  - “この1件を実装レベルのSubtaskに分解する”
  - “そのままTaskを作って着手する”
  を選べるようにする

---

## v2 仕様案（Backlog中心）

### 用語（v2）

- **Backlog（Backlog Session）**: 1つの入力文章から作られた “棚卸し結果” のまとまり
- **Backlog Item**: Backlog内の1項目（基本はユーザー要望/課題1件）
- **Task（既存）**: 実行と会話の単位（Backlog Itemから生成されうる）

### 画面・導線

#### 新規: Backlogページ（例: `/backlog`）

- **一覧ビュー**
  - 既存Backlog（Session）の一覧
  - ステータス（作成中/完了/失敗）、作成日時、対象Repo/Branch、Item数、入力の要約（先頭n文字）など
- **作成ビュー（Backlog生成）**
  - 要件テキスト貼り付け
  - Repo/Branch選択
  - Agent選択（CLI）
  - “粒度” オプション（後述）
  - 生成ログ表示
  - 生成結果（Backlog Items）を編集/選択して **Backlogとして保存**
- **Backlog詳細ビュー**
  - Backlog Items の編集（タイトル、説明、受け入れ条件、メモ/不明点、タグ）
  - Itemを選んで **Task化（作成）** できる
  - （任意）Itemをさらに “実装タスクへ分解” する（v2.1/拡張）

#### Sidebar（v2の方向性）

- Sidebarは “Task（実行中/最近）” に寄せる
  - “Backlog” へのナビゲーションリンクを追加（またはヘッダーナビ）
  - Breakdownボタンは廃止 or 「Backlog」へ遷移（モーダルで完結させない）

### 分解（Breakdown）の粒度制御

**デフォルト（推奨）**: coarse（粗い）

- **coarse**: “ユーザー価値/要求単位” で 3〜10 件程度を目安にまとめる
- **medium**: coarse を少し分割（例: UI + API + migration 程度）
- **fine（旧挙動）**: 実装手順に近い細分化（必要時のみ）

API/プロンプト上は、以下のどれかで実現する:

- **案A（簡単）**: `TaskBreakdownRequest.context` に `granularity` と `max_items` を渡し、プロンプトで強制
- **案B（より明確）**: v2用に `POST /v1/backlogs/generate` を作り、専用スキーマで受ける

---

## v2 データ/API 設計案（計画）

### データモデル（最小）

新規テーブル（例）:

- `backlogs`
  - `id`
  - `repo_id`
  - `branch`
  - `executor_type`
  - `status`（RUNNING/SUCCEEDED/FAILED）
  - `original_content`
  - `summary`（任意）
  - `created_at`, `updated_at`
- `backlog_items`
  - `id`
  - `backlog_id`
  - `title`
  - `description`（要件の要約）
  - `acceptance_criteria`（箇条書き or text）
  - `notes` / `unknowns`（不明点・調査TODO）
  - `tags`（json配列 or 文字列）
  - `status`（open / done / archived 等は将来）
  - `created_at`, `updated_at`

> ポイント: v1では `Task.description` をDBに持っていないため、Backlog側で “要件の詳細” を保持し、Taskは会話開始の器として使う。

### API（案）

- `POST /v1/backlogs/generate`
  - 入力: `content`, `repo_id`, `branch`, `executor_type`, `granularity`, `max_items`, `language`
  - 出力: `backlog_id`, `status=RUNNING`
- `GET /v1/backlogs/{backlog_id}`
  - 出力: Backlog本体 + Items（SUCCEEDED時）
- `GET /v1/backlogs/{backlog_id}/logs`
  - v1同様のポーリングログ
- `GET /v1/backlogs`
  - 一覧
- `PATCH /v1/backlogs/{backlog_id}/items/{item_id}`
  - 編集
- `POST /v1/backlogs/{backlog_id}/items:to_tasks`
  - 選択Itemを `Task` に変換して作成（bulk）
  - 返却: `created_task_ids`

### プロンプト（v2の方向性）

v1の「実装手順」寄りから、v2は以下に寄せる:

- **出力は “Backlog Items（=要求単位）”**
- 各Itemは
  - 何を達成するか（ユーザー価値）
  - 受け入れ条件
  - 不明点（調査が必要な点）
  - 影響範囲（候補のファイル/モジュールは “参考” 程度）
  を中心にする
- **タスク数を抑制**: `max_items` を超えない / 類似要求は統合

例（イメージ）: `.dursor-backlog.json`

- `items[].title` は “機能/改善” の粒度
- `items[].implementation_hint` は optional（fine時のみ強く要求）

---

## 実装計画（段階的）

### Phase 0: 仕様確定（ドキュメント・I/Fの固定）

- Backlogの定義（Taskとの違い、保存期間、編集範囲）
- 粒度オプション（coarse/medium/fine）とデフォルト
- 既存 `/breakdown` の扱い（互換維持 or Backlogへ移行）

### Phase 1: バックエンド（Backlog永続化）

- DBスキーマに `backlogs` / `backlog_items` を追加
- DAO追加（list/get/create/update）
- `BacklogService`（breakdown_service を流用しつつ保存先を in-memory → DB へ）
- Routes追加（generate/list/get/logs/edit/to_tasks）
- 既存 `OutputManager` をBacklogでも再利用（idを `backlog_id` として使う）

### Phase 2: フロントエンド（Backlogページ）

- `/backlog` ページ追加
  - Backlog一覧、Backlog作成、Backlog詳細（Itemsの編集・Task化）
- Sidebarの整理
  - Breakdownボタン→Backlogページへ遷移（または削除）
  - Task一覧は “最近のTask” 程度に縮小するか、現状維持しつつ Backlogを主導線にする

### Phase 3: 粒度改善（デフォルトcoarse + 上限）

- v2プロンプトへ切替
- `granularity` と `max_items` を必須級にし、coarseをデフォルトに
- “1要望=1項目” を守るためのルール追加
  - 類似項目の統合（重複排除）
  - どうしても多い場合は “まずグルーピングしてから” 出す（カテゴリごとにまとめる）

### Phase 4: 体験の磨き込み（任意）

- Backlog Item → “詳細分解（fine）” の二段階分解（v2.1）
- テンプレ/例文（Backlog作成時）
- KPI（Backlog作成→Task化→PR作成）導線の計測

---

## リスク・懸念点（先に書いておく）

- **用語衝突**: “Task” が既存で会話単位なので、Backlog Itemを “Task” と呼ぶと混乱する
  - UI上は “Backlog Item / Task（実行）” を明確に分けるのが安全
- **保存先**: v1は分解結果が in-memory（サーバ再起動で消える）なので、Backlog化するなら永続化が必須
- **権限/マルチユーザ**: 現状の単一ユーザ前提が崩れるとBacklog共有/所有者概念が必要（v0.2以降の課題）
- **機密情報**: 入力テキストに顧客情報が入る可能性がある
  - ログ/DBにどこまで残すか（マスキング/保存期間/削除機能）を検討する

---

## 変更の“狙い”まとめ（v2）

- Breakdown = **タスク量産機** ではなく、**Backlog生成（棚卸し）** に位置付ける
- “実装の手順” は後回しにし、まず **ユーザー要望単位** に統合して管理する
- サイドバーに積み上がるのではなく、Backlogページで **編集・取捨選択・着手（Task化）** を回す

