# タスク分解機能の追加計画 (Task Split & Bulk Import)

## 1. 概要
ヒアリング（現実世界での打ち合わせやチャットログ）の文章をそのまま貼り付け、AIによって自動的に「機能追加」や「バグ修正」などの開発タスクに分解し、一括で登録・実行できる機能を追加する。
これにより、要件定義からタスク化までの手間を削減する。

## 2. UI/UX設計

### 2.1 配置
`apps/web/src/app/page.tsx` (HomePage) にタブまたはモード切替を追加し、以下の2つのモードを選択可能にする。

1.  **Single Task** (既存): 1つのタスクを直接入力して実行。
2.  **Import from Hearing** (新規): ヒアリングテキストから複数タスクを生成。

### 2.2 画面フロー (Import from Hearing)

1.  **Input Phase**:
    *   大きなテキストエリアにヒアリング内容（議事録、チャットログ、要件メモなど）を貼り付ける。
    *   使用するModelとRepository/Branchを選択する（既存UI流用）。
    *   「Analyze & Split」ボタンを押下。

2.  **Preview Phase**:
    *   AIによって分解されたタスクのリストが表示される。
    *   各タスク項目:
        *   **Title**: タスクの簡潔なタイトル。
        *   **Description**: 詳細な指示内容（ヒアリング内容からの抽出）。
        *   **Type**: Feature / Bugfix / Refactor 等（ラベル）。
        *   **Actions**: 編集ボタン、削除ボタン。
    *   ユーザーはタスクの追加・削除・修正が可能。
    *   「Create Tasks」ボタンで確定。

3.  **Execution Phase**:
    *   確定すると、Frontendから順次タスク作成APIが呼ばれる。
    *   作成されたタスクへのリンクが表示されるか、タスク一覧画面へ遷移する。

## 3. Backend API設計

### 3.1 新規エンドポイント

**POST /v1/tasks/analyze**

ヒアリング内容を受け取り、タスク分解案を返す。

*   **Request**:
    ```json
    {
      "text": "ヒアリング内容の全文...",
      "model_id": "optional-model-id-for-analysis"
    }
    ```
*   **Response**:
    ```json
    {
      "tasks": [
        {
          "title": "ログイン画面の実装",
          "description": "JWTを用いた認証機能を実装する。...",
          "type": "feature"
        },
        {
          "title": "ロゴの修正",
          "description": "ヘッダーのロゴが崩れているので修正する。",
          "type": "bug"
        }
      ]
    }
    ```

### 3.2 ロジック

*   `TaskAnalysisService` を新設。
*   指定されたModel（またはデフォルトモデル）を使用し、LLMにプロンプトを送信。
*   プロンプトの指示:
    *   入力テキストを読み解き、開発タスクに分解すること。
    *   各タスクは独立して実行可能な粒度にすること。
    *   JSON形式で出力すること。

## 4. データ構造・モデル

新規DBモデルは不要。
解析結果は一時的なものであり、クライアント側で確認後に既存の `Task` エンティティとして保存されるため。

## 5. 実装ステップ

1.  **Backend: TaskAnalysisServiceの実装**
    *   LLMプロンプトの設計。
    *   JSONパース処理。
2.  **Backend: API Endpointの実装**
    *   `POST /v1/tasks/analyze` の追加。
3.  **Frontend: UIコンポーネント作成**
    *   `HearingImportForm`: テキスト入力と解析ボタン。
    *   `TaskPreviewList`: 解析結果の表示と編集。
4.  **Frontend: HomePageへの統合**
    *   タブ切り替えの実装。
    *   API連携。

## 6. 技術的考慮事項

*   **コンテキスト長**: ヒアリングログが非常に長い場合、コンテキストウィンドウを超える可能性がある。
    *   対策: 必要に応じてトークン数をチェックし、警告を出すか、RAG的なアプローチ（今回はスコープ外だが将来的に考慮）をとる。v1では単純に全文を送る。
*   **LLMの出力安定性**: JSON形式が崩れる場合がある。
    *   対策: リトライロジックを入れるか、出力フォーマットを厳格に指定する（OpenAI JSON Modeなど）。
