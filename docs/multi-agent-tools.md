## 複数Agent tool（Claude Code / Codex / Gemini CLI）並列実行オプション 追加計画

### 目的
- **実行時に複数のAgent toolを選択**できるようにし、1回の実行でそれぞれのtoolを**並列実行**する。
- 実行後は、選択した分だけ **Run（カード）が複数生成**され、現状と同じUIで「Summary/Diff/Logs」を個別に確認できるようにする。

### 背景（現状整理）
- 現状のRun作成API（`POST /v1/tasks/{task_id}/runs`）は `RunsCreated{ run_ids: [] }` を返すため、**複数Runの作成自体は既に前提**になっている。
- ただし、現在の並列作成は主に `patch_agent`（`model_ids` 複数指定）で使われており、CLI系（`claude_code` / `codex_cli` / `gemini_cli`）は **1回のリクエストで1Run**（単一選択）前提になっている。
- UI側も `ExecutorSelector` でモデルは複数選択できるが、CLIは単一選択のラジオUIになっている。

---

## 期待するユーザー体験（UX）

### 実行前（選択UI）
- `ExecutorSelector` に **「複数選択」トグル**（例: “Use Multiple Agents”）を追加。
- トグルON時:
  - Claude Code / Codex / Gemini CLI を **チェックボックスで複数選択**できる。
  - ボタン表示は「`Claude Code, Codex, Gemini CLI`」または「`3 agents selected`」等に要約表示。
- トグルOFF時:
  - 従来通り **単一選択**（互換維持）。

### 実行後（Runカード）
- 1メッセージ（`message_id`）に紐づくRunが複数作られるため、既存の `RunsPanel` の「message_idでグルーピング」仕様により、
  - 同一指示の下に **複数Runカードが並ぶ**
  - 各Runを開くと **従来同様に Summary/Diff/Logs を閲覧**できる
  - CLI実行中は `StreamingLogs` で **ストリーミング表示**される

---

## 仕様（要件）

### 機能要件
- **FR-1**: 1回の実行で複数のCLI executor（`claude_code` / `codex_cli` / `gemini_cli`）を選択できる。
- **FR-2**: 選択された各executorに対して **Runレコードを個別に作成し、並列実行**する。
- **FR-3**: 生成されたRunは既存と同様に `GET /v1/tasks/{task_id}/runs` で取得でき、UIはカードとして表示できる。
- **FR-4**: 既存の単一実行（CLI単体、PatchAgentの複数モデル）と互換性を保つ。

### 非機能要件
- **NFR-1**: CLI並列実行数が増えるため、サーバの過負荷を避けるガード（同時実行上限等）を用意できる設計にする。
- **NFR-2**: 失敗はRun単位（部分失敗）で扱い、他Runへ影響させない。
- **NFR-3**: API/DBは後方互換（マイグレーションが必要な場合は最小限）で進める。

---

## API設計案

### 方針
既存の `RunCreate` を後方互換のまま拡張し、**1リクエストで複数のCLI executorを指定**できるようにする。

### 変更案（v1互換の拡張）
`RunCreate` に以下を追加する：
- `executor_types?: ExecutorType[]`
  - 指定された場合、配列要素ごとにRunを作成する（**multi-executor**）。
  - `executor_types` は **CLI executorのみに限定**（`claude_code`, `codex_cli`, `gemini_cli`）。

#### リクエストのバリデーションルール
- `executor_types` が指定された場合:
  - `executor_types` は 1..N、重複なし
  - すべて CLI executor であること
  - `model_ids` は未指定（または空）であること（混在禁止）
  - `executor_type` は無視（または `patch_agent` 以外ならエラーにする）※実装で一貫性を取る
- `executor_types` が未指定の場合は従来ルール:
  - `executor_type == patch_agent` の場合 `model_ids` が必要（既存の“前回セット再利用”仕様も維持）
  - `executor_type` がCLI executorの場合は単一Runを作成

#### レスポンス
- `RunsCreated` は既に `run_ids: list[str]` を返すため変更不要。

---

## バックエンド実装計画（FastAPI）

### 1) Domain / Schema
- `apps/api/src/dursor_api/domain/models.py`
  - `RunCreate` に `executor_types: list[ExecutorType] | None` を追加
- DBスキーマ変更は不要（Runはすでに executor_type を持ち、複数Run作成は表現できるため）

### 2) RunService の拡張
- `apps/api/src/dursor_api/services/run_service.py` の `create_runs()` を拡張し、以下を実装する：
  - `executor_types` 指定時:
    - `for executor_type in executor_types: _create_cli_run(...)` を呼び、**それぞれRunを作成してenqueue**
  - 既存の “executor lock” 挙動（タスク内でexecutor_typeを固定する仕様）は、multi CLI導入により意味が変わるため見直す：
    - **提案**: 「PatchAgentかCLIか」のモードだけロックし、CLIモードでは `executor_types` の変更を許容（または最初の選択セットをロック）
    - どちらを採用するかはUX優先で決める（下の「運用ポリシー」参照）

### 3) 競合/安全性（worktree・セッション）
- 現状 `_create_cli_run()` は `task_id + executor_type` 単位で worktree を再利用する（会話継続のため）。
- multi CLIは基本「**異なるexecutor_type** を1つずつ」起動する想定なので、worktreeは分離され衝突しない。
- ただし同一executorを重複選択した場合や連打で競合が起きる可能性があるため、以下のガードを入れる：
  - `executor_types` の重複禁止（入力バリデーション）
  - （任意）同一 `task_id + executor_type` に `queued/running` が存在する場合は新規作成を拒否/警告

### 4) 並列数の上限（過負荷対策）
現状キューは `asyncio.create_task()` で無制限に並列化され得る。
- **提案**: CLI実行にだけ `asyncio.Semaphore` を導入し、同時実行数を制限する
  - 例: `DURSOR_MAX_CONCURRENT_CLI_RUNS=2`（未設定なら現状維持）
  - PatchAgentはAPI呼び出し中心、CLIはリソースを食いやすいため分ける

---

## フロントエンド実装計画（Next.js）

### 1) 型定義
- `apps/web/src/types.ts`
  - `RunCreate` に `executor_types?: ExecutorType[]` を追加

### 2) ExecutorSelector UI
- `apps/web/src/components/ExecutorSelector.tsx` を拡張
  - CLIセクションに **複数選択トグル**を追加
  - トグルON時は CLI_OPTIONS をチェックボックス化し、複数選択状態を保持
  - 送信時は `runsApi.create()` に `executor_types` を渡す

#### 状態管理（提案）
既存は `executorType`（単一）＋ `selectedModels`（複数）で状態を持っている。
multi CLI導入に合わせて、以下のいずれかに拡張する：
- **案A（最小変更）**: `selectedCliExecutors: ExecutorType[]` を追加
  - `executorType` は互換のため残し、UI/送信時に `executor_types` を使う
- **案B（整理優先）**: 選択状態を union に統合
  - `selection = { kind: 'models', modelIds: [] } | { kind: 'cli', executorTypes: [] }`
  - ただし影響範囲がやや広い

本計画では **案A** を第一候補とする（実装・移行が簡単）。

### 3) Runs表示
- `RunsPanel` は `message_id` でRunをグルーピングして表示しているため、multi CLIでRunが増えても基本的に追加実装なしで要件を満たす。
- `RunResultCard` も `executor_type` がCLIの場合の見た目・ログ表示が既にあるため、そのまま使える。

---

## 運用ポリシー（重要）

### “executor lock” の扱い
現状 `RunService.create_runs()` は「タスク内で最初に選んだexecutorを固定」する挙動がある（会話継続の期待に合わせるため）。
multi CLI導入後に矛盾が出やすいので、以下どちらかを採用する：

- **ポリシー1（推奨）**: “モード”のみ固定
  - 最初の実行が `patch_agent` ならタスク内は patch_agent を維持
  - 最初の実行がCLIならタスク内はCLIを維持
  - CLI内では `executor_types` は自由に変更可能（例: 次回はCodexだけ等）

- **ポリシー2**: “選択セット”も固定
  - 最初に選んだCLIセット（例: Claude+Gemini）をタスク内で維持
  - 体験は一貫するが、柔軟性は下がる

この選択はUIの期待（画像のように毎回選べるか/固定か）に直結するため、実装時にどちらを採用するか明確にする。

---

## エッジケース / エラーハンドリング
- **部分失敗**: 3つのうち1つが失敗しても他は成功しうる。UIはRun単位で成功/失敗を表示。
- **同時実行の衝突**: 同一executorを同じtaskで同時に走らせるのは避ける（入力制約＋サーバ側ガード）。
- **セッション継続**: CLI側が session を拒否する場合は既に「session_idなしで1回リトライ」実装がある。multiでもRun単位で同様に扱う。
- **PR作成**: PRは `selected_run_id` を1つ選んで作成する仕様のまま（“ベストのRunを選んでPR化”）。multi実行は比較のためのRunを増やす位置付け。

---

## 実装ステップ（作業手順）
- **Step 1**: `RunCreate` への `executor_types` 追加（API/型）
- **Step 2**: `RunService.create_runs()` の multi CLI分岐追加＋バリデーション
- **Step 3**: （任意）CLI同時実行数のセマフォ導入
- **Step 4**: フロント `ExecutorSelector` に “Use Multiple Agents” トグル＋チェックボックスUI追加
- **Step 5**: 実行ボタン押下時のpayloadを `executor_types` に切り替え（トグルON時）
- **Step 6**: E2E確認（Runsが複数生成され、各カードのlogs/summary/diffが参照できること）

---

## テスト計画

### Backend
- **ユニットテスト**（`RunService.create_runs`）
  - `executor_types=[claude_code,codex_cli]` でRunが2件作られる
  - `executor_types` に patch_agent が混ざると 400
  - `executor_types` と `model_ids` を同時指定すると 400
  - 既存の `executor_type=claude_code`（単体）が壊れていない

### Frontend
- **UIテスト/手動確認**
  - トグルOFFで従来の単一CLI選択が動く
  - トグルONで複数CLIを選べ、送信payloadが `executor_types` になる
  - 実行後にRunカードが複数表示され、各カードを展開して結果が見える

---

## 追加の拡張案（将来）
- **比較ビュー**: 複数RunのSummary/Diffを横並び比較し、“推奨Run” を提示するReviewAgent（`docs/agents.md` の計画とも整合）。
- **重み（1x/2x）**: 画像の「1x」のような実行回数指定が欲しい場合は、`executor_types` を `[{type, count}]` 形式に拡張する（v2設計）。
- **永続キュー**: v0.2でRedis等へ移行すると、並列数制御・再起動耐性が改善する。

