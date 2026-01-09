"""Repository routes."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from dursor_api.dependencies import get_github_service, get_repo_service
from dursor_api.domain.models import PRTemplateInfo, Repo, RepoCloneRequest, RepoSelectRequest
from dursor_api.services.github_service import GitHubService
from dursor_api.services.pr_template_service import PRTemplateService
from dursor_api.services.repo_service import RepoService

router = APIRouter(prefix="/repos", tags=["repos"])


@router.post("/clone", response_model=Repo, status_code=201)
async def clone_repo(
    data: RepoCloneRequest,
    repo_service: RepoService = Depends(get_repo_service),
) -> Repo:
    """Clone a repository."""
    try:
        return await repo_service.clone(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to clone: {str(e)}")


@router.post("/select", response_model=Repo, status_code=201)
async def select_repo(
    data: RepoSelectRequest,
    repo_service: RepoService = Depends(get_repo_service),
    github_service: GitHubService = Depends(get_github_service),
) -> Repo:
    """Select and clone a repository by owner/repo name using GitHub App authentication."""
    try:
        return await repo_service.select(data, github_service)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to select repository: {str(e)}")


@router.get("/{repo_id}", response_model=Repo)
async def get_repo(
    repo_id: str,
    repo_service: RepoService = Depends(get_repo_service),
) -> Repo:
    """Get a repository by ID."""
    repo = await repo_service.get(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.get("/{repo_id}/pull-request-templates", response_model=list[PRTemplateInfo])
async def list_pr_templates(
    repo_id: str,
    repo_service: RepoService = Depends(get_repo_service),
) -> list[PRTemplateInfo]:
    """List available PR templates for a repository.

    Returns all PR templates found in the repository, including:
    - .github/pull_request_template.md
    - .github/PULL_REQUEST_TEMPLATE.md
    - pull_request_template.md (root)
    - docs/pull_request_template.md
    - .github/PULL_REQUEST_TEMPLATE/*.md (multiple templates)
    """
    repo = await repo_service.get(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    template_service = PRTemplateService()
    workspace_path = Path(repo.workspace_path)
    templates = template_service.enumerate_templates(workspace_path)

    return [
        PRTemplateInfo(
            path=t.path,
            filename=t.filename,
            source=t.source,
            is_default_candidate=t.is_default_candidate,
            preview=t.content[:200] if t.content else None,
        )
        for t in templates
    ]
