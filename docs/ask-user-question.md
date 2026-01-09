# AskUserQuestion Tool - Dursor統合ガイド

## 概要

Claude Codeの`AskUserQuestion`ツールは、実行中にAIがユーザーに質問を投げかけるための内部ツールです。本ドキュメントでは、このツールの仕様と、DursorのUIでClaude Codeセッション中に利用するための実装案をまとめます。

## AskUserQuestionツールとは

### 目的

AskUserQuestionは、Claude Codeが実行を一時停止し、ユーザーに複数選択式の質問を提示する機能です。

主な用途:
1. ユーザーの要望や要件の収集
2. 曖昧な指示の明確化
3. 実装方針の決定
4. 進む方向性の選択肢提示

### ツールスキーマ

```typescript
interface AskUserQuestionTool {
  questions: Question[];  // 1-4個の質問（必須）
}

interface Question {
  question: string;       // 完全な質問文（必須）
  header: string;         // 短いラベル、最大12文字（必須）
  multiSelect: boolean;   // 複数選択を許可するか（必須）
  options: Option[];      // 2-4個の選択肢（必須）
}

interface Option {
  label: string;          // 表示テキスト、1-5語（必須）
  description: string;    // 選択の意味の説明（必須）
}
```

### 動作仕様

- **「Other」オプション**: ユーザーは常に「Other」を選択してカスタムテキスト入力が可能（自動追加）
- **複数選択**: `multiSelect: true`で複数回答を許可
- **推奨オプション**: 推奨する選択肢は最初に配置し、ラベル末尾に「(Recommended)」を付ける
- **制約**:
  - 1回の呼び出しで1-4個の質問
  - 各質問に2-4個の選択肢
  - ヘッダーは最大12文字
  - ラベルは1-5語

### stream-json出力での表現

Claude CLIの`--output-format stream-json`モードでは、AskUserQuestionはtool_useとして出力されます：

```json
{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_xxx","name":"AskUserQuestion","input":{"questions":[{"question":"Which database should we use?","header":"Database","multiSelect":false,"options":[{"label":"PostgreSQL (Recommended)","description":"Robust relational database"},{"label":"SQLite","description":"Lightweight file-based database"}]}]}}]}}
```

## 現在のDursorの制限

### 現在のClaude Code実行方式

Dursorは以下のフラグでClaude CLIを実行しています：

```python
cmd = [
    self.options.claude_cli_path,
    "-p",                              # 非対話（print）モード
    instruction,
    "--dangerously-skip-permissions",  # プロンプトなしでファイル編集許可
    "--verbose",
    "--output-format", "stream-json",
]
```

また、stdinは`DEVNULL`に設定されており、対話入力を受け付けません：

```python
process = await asyncio.create_subprocess_exec(
    *cmd,
    stdin=asyncio.subprocess.DEVNULL,  # 対話入力を無効化
    ...
)
```

### AskUserQuestionが機能しない理由

1. **TTYなし**: サブプロセスとしてClaude CLIを実行する場合、TTY（端末）が接続されていないため、AskUserQuestionのTUIを描画できない
2. **stdin無効**: `stdin=DEVNULL`のため、ユーザー入力を受け取れない
3. **非対話モード**: `-p`フラグにより、対話的なプロンプトがスキップされる

結果として、AskUserQuestionツールは空のレスポンスを返すか、機能しないことが報告されています。

## 実装案

### 案A: stream-jsonベースの双方向通信（推奨）

#### 概要

Claude CLIの`--input-format stream-json`と`--output-format stream-json`を組み合わせ、双方向のNDJSON通信を実現します。

#### アーキテクチャ

```
┌────────────────┐      ┌────────────────┐      ┌────────────────┐
│   Frontend     │ ←──→ │    Backend     │ ←──→ │  Claude CLI    │
│   (React)      │      │   (FastAPI)    │      │  (subprocess)  │
└────────────────┘      └────────────────┘      └────────────────┘
        │                       │                       │
        │ WebSocket/SSE        │ stdin/stdout          │
        │ ユーザー回答         │ NDJSON stream         │
        └───────────────────────┴───────────────────────┘
```

#### 実装ステップ

1. **Claude CLI起動の変更**
```python
cmd = [
    self.options.claude_cli_path,
    "-p",
    instruction,
    "--verbose",
    "--output-format", "stream-json",
    "--input-format", "stream-json",  # 追加
]

process = await asyncio.create_subprocess_exec(
    *cmd,
    stdin=asyncio.subprocess.PIPE,  # DEVNULL → PIPE に変更
    stdout=asyncio.subprocess.PIPE,
    ...
)
```

2. **AskUserQuestion検出**
```python
def _extract_display_text(self, json_line: str) -> tuple[str | None, dict | None]:
    data = json.loads(json_line)
    if data.get("type") == "assistant":
        content = data.get("message", {}).get("content", [])
        for block in content:
            if block.get("type") == "tool_use" and block.get("name") == "AskUserQuestion":
                return None, {
                    "type": "ask_user_question",
                    "tool_use_id": block.get("id"),
                    "questions": block.get("input", {}).get("questions", [])
                }
    # ... 既存の処理
```

3. **フロントエンドUIコンポーネント**
```typescript
interface AskUserQuestionEvent {
  type: 'ask_user_question';
  tool_use_id: string;
  questions: Question[];
}

function QuestionDialog({ event, onAnswer }: Props) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});

  return (
    <Dialog open>
      {event.questions.map((q, i) => (
        <QuestionCard key={i} question={q} onSelect={(opts) => setAnswers(...)} />
      ))}
      <Button onClick={() => onAnswer(answers)}>回答を送信</Button>
    </Dialog>
  );
}
```

4. **回答の送信**
```python
async def send_answer(self, tool_use_id: str, answers: dict):
    response = {
        "type": "user",
        "message": {
            "role": "user",
            "content": [{
                "type": "tool_result",
                "tool_use_id": tool_use_id,
                "content": json.dumps(answers)
            }]
        }
    }
    self.process.stdin.write((json.dumps(response) + "\n").encode())
    await self.process.stdin.drain()
```

#### メリット
- Claude Codeのネイティブ機能をフル活用
- 他のtool_use（ファイル編集確認など）にも拡張可能
- セッション継続性を維持

#### デメリット
- 複雑な双方向通信の実装が必要
- stdinへの書き込みタイミングの管理が複雑
- Claude CLI側のstream-json入力サポートの詳細仕様に依存

---

### 案B: MCPツールによるカスタム実装

#### 概要

Claude Code SDKのMCPサーバー機能を使用し、Dursor独自の「ask_user」ツールを定義します。

#### アーキテクチャ

```
┌────────────────┐      ┌────────────────┐      ┌────────────────┐
│   Frontend     │ ←──→ │    Backend     │ ←──→ │  Claude CLI    │
│   (React)      │      │   (FastAPI)    │      │   + MCP Tool   │
└────────────────┘      └────────────────┘      └────────────────┘
        │                       │                       │
        │ WebSocket/SSE        │ MCP Protocol          │
        │ ユーザー回答         │ (stdin/stdout)        │
        └───────────────────────┴───────────────────────┘
```

#### 実装ステップ

1. **MCPサーバー定義**
```python
# dursor_mcp_server.py
from mcp import Server, Tool

server = Server("dursor-interactive")

@server.tool("ask_user")
async def ask_user(questions: list[dict]) -> dict:
    """Ask user for input during execution."""
    # Dursor backendにWebSocket経由で質問を送信
    # ユーザー回答を待機
    # 回答を返す
    ...
```

2. **Claude CLI起動時にMCPサーバーを指定**
```python
cmd = [
    self.options.claude_cli_path,
    "-p",
    instruction,
    "--mcp-server", "dursor-interactive",  # MCPサーバー指定
    ...
]
```

3. **システムプロンプトでツール使用を指示**
```
When you need to ask the user questions, use the ask_user tool instead of AskUserQuestion.
```

#### メリット
- Dursorのバックエンドで完全制御可能
- WebSocketでリアルタイム双方向通信を実装済みの場合、統合が容易
- 任意のUI/UXを設計可能

#### デメリット
- MCPサーバーの追加実装が必要
- Claude Codeのネイティブ機能ではないため、AIがツールを使わない可能性
- MCPサーバーのライフサイクル管理が必要

---

### 案C: WebSocketベースのプロキシ実装

#### 概要

Claude CLIをptyで起動し、フロントエンドとWebSocketで接続して完全な双方向通信を実現します。

#### アーキテクチャ

```
┌────────────────┐      ┌────────────────┐      ┌────────────────┐
│   Frontend     │ ←──→ │    Backend     │ ←──→ │  Claude CLI    │
│   (xterm.js)   │ WS   │  (pty proxy)   │ PTY  │  (TTY mode)    │
└────────────────┘      └────────────────┘      └────────────────┘
```

#### 実装ステップ

1. **PTYでClaude CLIを起動**
```python
import pty
import os

master, slave = pty.openpty()
process = await asyncio.create_subprocess_exec(
    *cmd,
    stdin=slave,
    stdout=slave,
    stderr=slave,
)
```

2. **WebSocket経由でターミナルI/Oを中継**
```python
@router.websocket("/runs/{run_id}/terminal")
async def terminal_ws(websocket: WebSocket, run_id: str):
    await websocket.accept()

    async def read_pty():
        while True:
            data = os.read(master, 1024)
            await websocket.send_bytes(data)

    async def write_pty():
        async for message in websocket.iter_bytes():
            os.write(master, message)

    await asyncio.gather(read_pty(), write_pty())
```

3. **フロントエンドでxterm.js使用**
```typescript
import { Terminal } from 'xterm';

const terminal = new Terminal();
const ws = new WebSocket(`/api/runs/${runId}/terminal`);

terminal.onData(data => ws.send(data));
ws.onmessage = e => terminal.write(e.data);
```

#### メリット
- Claude CLIの完全な対話モードを実現
- AskUserQuestion以外の全ての対話機能が使用可能
- 既存のターミナルエミュレータUIライブラリを活用可能

#### デメリット
- セキュリティリスク（任意入力の許可）
- `--dangerously-skip-permissions`が使えなくなり、全ての確認が必要に
- 自動化との両立が困難
- 実装の複雑さが最も高い

---

### 案D: 自動応答モード（最小実装）

#### 概要

AskUserQuestionが発生した際に、自動的にデフォルトオプション（推奨または最初の選択肢）を選択します。

#### 実装

```python
# Claude CLI起動時に環境変数で設定
env["CLAUDE_ASK_USER_QUESTION_BEHAVIOR"] = "first_option"
```

または、プロンプトで指示：

```
Important: If you need to make a decision, prefer the recommended option or proceed with the most common approach. Do not ask for clarification unless absolutely necessary.
```

#### メリット
- 実装が最も簡単
- 既存のアーキテクチャを変更不要
- 完全自動化に適している

#### デメリット
- ユーザーの意思決定機会がない
- 最適でない選択をする可能性
- AskUserQuestionの本来の目的（明確化）を失う

---

## 推奨実装アプローチ

### 段階的実装

1. **Phase 1: 案D（自動応答）で最小実装**
   - 即座に実装可能
   - ユーザーに明確な制約として提示

2. **Phase 2: 案A（stream-json双方向通信）の調査・PoC**
   - Claude CLIのstream-json入力仕様を確認
   - 小規模なPoCで実現可能性を検証

3. **Phase 3: 案Aまたは案Bの本実装**
   - PoCの結果に基づき、最適なアプローチを選択
   - UIコンポーネントとバックエンドを同時開発

### UIデザイン案

AskUserQuestionが発生した場合のUIモックアップ：

```
┌────────────────────────────────────────────────────────┐
│ 🤖 Claude Code is asking for your input               │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Database                                               │
│ ────────                                               │
│ Which database should we use for this project?        │
│                                                        │
│ ○ PostgreSQL (Recommended)                            │
│   Robust relational database with advanced features   │
│                                                        │
│ ○ SQLite                                              │
│   Lightweight file-based database, good for dev       │
│                                                        │
│ ○ MySQL                                               │
│   Popular open-source database                        │
│                                                        │
│ ○ Other: [________________]                           │
│                                                        │
├────────────────────────────────────────────────────────┤
│                              [Skip] [Submit Answer]   │
└────────────────────────────────────────────────────────┘
```

### API設計案

```yaml
# 新規エンドポイント
POST /runs/{run_id}/answer
  Request:
    tool_use_id: string
    answers: Record<string, string | string[]>
  Response:
    success: boolean

# SSEイベント拡張
GET /runs/{run_id}/logs/stream
  Events:
    - type: log
      data: { line_number, content }
    - type: ask_user_question  # 新規
      data: { tool_use_id, questions }
    - type: complete
```

## 参考資料

- [Claude Code Headless Mode](https://code.claude.com/docs/en/headless)
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview)
- [AskUserQuestion Tool Discussion](https://github.com/anthropics/claude-agent-sdk-python/issues/327)
- [Stream-JSON Chaining](https://github.com/ruvnet/claude-flow/wiki/Stream-Chaining)
