# dursor - Repository Overview

## What is dursor?

**dursor** is a self-hostable multi-model parallel coding agent. It enables developers to:

1. Submit coding tasks in natural language
2. Execute tasks across multiple LLM models simultaneously (OpenAI, Anthropic, Google)
3. Compare generated code patches side-by-side
4. Create GitHub Pull Requests from the best solution

**Key Value Proposition**: Run the same instruction on GPT-4, Claude, and Gemini in parallel, then pick the best result and turn it into a PR with one click.

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                             │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js Frontend (Port 3000)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │   Home   │  │   Task   │  │ Settings │  │    Components    │ │
│  │   Page   │  │   Page   │  │   Page   │  │ (Chat, Runs,     │ │
│  │          │  │          │  │          │  │  DiffViewer)     │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└───────────────────────────────┬─────────────────────────────────┘
                                │ REST API
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Port 8000)                   │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐ │
│  │      Routes      │  │              Services                │ │
│  │ /models /repos   │  │  ModelService, RepoService,         │ │
│  │ /tasks /runs     │──▶  RunService, PRService,             │ │
│  │ /prs   /github   │  │  GitHubService, CryptoService       │ │
│  └──────────────────┘  └───────────────┬──────────────────────┘ │
│                                        │                        │
│  ┌─────────────────────────────────────▼──────────────────────┐ │
│  │                     Agent System                           │ │
│  │  PatchAgent → LLMRouter → LLMClient → OpenAI/Anthropic/   │ │
│  │                                        Google APIs         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     Storage Layer                           ││
│  │              DAOs → SQLite (aiosqlite)                      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  OpenAI  │  │Anthropic │  │  Google  │  │     GitHub       │ │
│  │   API    │  │   API    │  │   API    │  │    (via App)     │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### 1. Model Profiles
A **ModelProfile** represents a configured LLM with:
- Provider (OpenAI, Anthropic, Google)
- Model name (e.g., `gpt-4o`, `claude-3-opus`)
- API key (encrypted at rest)

Users can configure multiple models and run them in parallel.

### 2. Tasks & Messages
A **Task** is a conversation unit centered around a coding goal:
- Linked to a Git repository
- Contains chat messages (user instructions, system responses)
- Tracks multiple runs and PRs

### 3. Runs (Parallel Execution)
A **Run** is a single model execution:
- Receives an instruction + workspace
- Generates a unified diff patch
- Status: queued → running → succeeded/failed/canceled

**Parallel execution**: Submit one instruction, get patches from GPT-4, Claude, and Gemini simultaneously.

### 4. Pull Requests
Once you select the best run, create a **PR** with one click:
- Applies the patch to a new branch
- Pushes via GitHub App authentication
- Creates the PR via GitHub API

## Key Workflows

### Workflow 1: Create Task and Run Models

```
User                    Frontend                Backend                 LLMs
  │                        │                       │                      │
  │ 1. Enter instruction   │                       │                      │
  ├───────────────────────▶│                       │                      │
  │                        │ 2. Clone repo         │                      │
  │                        ├──────────────────────▶│                      │
  │                        │                       │ (git clone)          │
  │                        │ 3. Create task        │                      │
  │                        ├──────────────────────▶│                      │
  │                        │ 4. Create runs        │                      │
  │                        ├──────────────────────▶│                      │
  │                        │                       │ 5. Execute in        │
  │                        │                       │    parallel          │
  │                        │                       ├─────────────────────▶│
  │                        │                       │◀─────────────────────┤
  │                        │ 6. Return patches     │                      │
  │                        │◀──────────────────────┤                      │
  │ 7. View/compare        │                       │                      │
  │◀───────────────────────┤                       │                      │
```

### Workflow 2: Create PR from Run

```
User                    Frontend                Backend                GitHub
  │                        │                       │                      │
  │ 1. Select best run     │                       │                      │
  │ 2. Click "Create PR"   │                       │                      │
  ├───────────────────────▶│                       │                      │
  │                        │ 3. POST /prs          │                      │
  │                        ├──────────────────────▶│                      │
  │                        │                       │ 4. Create branch     │
  │                        │                       │ 5. Apply patch       │
  │                        │                       │ 6. Push              │
  │                        │                       ├─────────────────────▶│
  │                        │                       │ 7. Create PR         │
  │                        │                       ├─────────────────────▶│
  │                        │ 8. Return PR URL      │◀─────────────────────┤
  │                        │◀──────────────────────┤                      │
  │ 9. View PR             │                       │                      │
  │◀───────────────────────┤                       │                      │
```

## Directory Structure Summary

```
dursor/
├── apps/
│   ├── api/                        # FastAPI backend
│   │   └── src/dursor_api/
│   │       ├── main.py             # App entrypoint
│   │       ├── config.py           # Environment config
│   │       ├── agents/             # PatchAgent, LLMRouter
│   │       ├── domain/             # Pydantic models & enums
│   │       ├── routes/             # API endpoints
│   │       ├── services/           # Business logic
│   │       └── storage/            # SQLite DAOs
│   │
│   └── web/                        # Next.js frontend
│       └── src/
│           ├── app/                # Pages (Home, Task, Settings)
│           ├── components/         # UI components
│           ├── lib/                # API client
│           └── types.ts            # TypeScript types
│
├── docs/                           # Documentation
├── workspaces/                     # Cloned repos (gitignored)
├── data/                           # SQLite database (gitignored)
└── docker-compose.yml              # Container orchestration
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11+, Pydantic |
| Database | SQLite (aiosqlite) |
| LLM Integration | OpenAI SDK, Anthropic SDK, Google REST API |
| Git Operations | GitHub App authentication |
| Deployment | Docker Compose |

## Security Design

1. **API Key Encryption**: All API keys encrypted with Fernet (AES-128) before storage
2. **Workspace Isolation**: Each run gets an isolated copy of the repository
3. **Forbidden Paths**: `.git`, `.env`, `*.secret`, `*.key` blocked from modification
4. **No Shell Execution**: v0.1 generates patches only (no arbitrary command execution)
5. **GitHub App Auth**: Uses GitHub App (not personal tokens) for repository operations

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 20+
- Docker (optional)

### Option 1: Docker Compose
```bash
cp .env.example .env
# Edit .env with your settings
docker compose up -d --build
```

### Option 2: Local Development
```bash
# Backend
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python -m dursor_api.main

# Frontend (new terminal)
cd apps/web
npm install && npm run dev
```

Access at: http://localhost:3000

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DURSOR_ENCRYPTION_KEY` | API key encryption key (generate with Fernet) |

### GitHub App (for PR creation)

Configure via Settings UI or environment variables:
- `DURSOR_GITHUB_APP_ID`
- `DURSOR_GITHUB_APP_PRIVATE_KEY` (base64 encoded)
- `DURSOR_GITHUB_APP_INSTALLATION_ID`

### LLM API Keys

Either:
- Configure via Settings UI (stored encrypted in DB)
- Set environment variables: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`

## Related Documentation

- [Architecture](./architecture.md) - Detailed system design
- [API Reference](./api.md) - REST API documentation
- [Agent System](./agents.md) - LLM integration details
- [Development Guide](./development.md) - Setup and contribution guide

## Version Roadmap

| Version | Status | Features |
|---------|--------|----------|
| v0.1 | Current | Patch generation, parallel runs, PR creation |
| v0.2 | Planned | Docker sandbox, Review agent, PR comment triggers |
| v0.3 | Planned | Multi-user support, cost management, policy injection |
