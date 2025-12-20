"""Repository management service."""

import shutil
import uuid
from pathlib import Path

import git

from dursor_api.config import settings
from dursor_api.domain.models import Repo, RepoCloneRequest
from dursor_api.storage.dao import RepoDAO


class RepoService:
    """Service for managing Git repositories."""

    def __init__(self, dao: RepoDAO):
        self.dao = dao
        self.workspaces_dir = settings.workspaces_dir

    async def clone(self, data: RepoCloneRequest) -> Repo:
        """Clone a repository.

        Args:
            data: Clone request with repo URL and optional ref.

        Returns:
            Repo object with clone information.
        """
        # Generate unique workspace path
        workspace_id = str(uuid.uuid4())
        workspace_path = self.workspaces_dir / workspace_id

        # Clone the repository
        repo = git.Repo.clone_from(
            data.repo_url,
            workspace_path,
            depth=1,  # Shallow clone for faster initial clone
        )

        # Checkout specific ref if provided
        if data.ref:
            repo.git.checkout(data.ref)

        # Get repository info
        default_branch = repo.active_branch.name
        latest_commit = repo.head.commit.hexsha

        # Save to database
        return await self.dao.create(
            repo_url=data.repo_url,
            default_branch=default_branch,
            latest_commit=latest_commit,
            workspace_path=str(workspace_path),
        )

    async def get(self, repo_id: str) -> Repo | None:
        """Get a repository by ID.

        Args:
            repo_id: Repository ID.

        Returns:
            Repo object or None if not found.
        """
        return await self.dao.get(repo_id)

    async def find_by_url(self, repo_url: str) -> Repo | None:
        """Find a repository by URL.

        Args:
            repo_url: Git repository URL.

        Returns:
            Repo object or None if not found.
        """
        return await self.dao.find_by_url(repo_url)

    async def update_workspace(self, repo_id: str) -> Repo | None:
        """Pull latest changes to workspace.

        Args:
            repo_id: Repository ID.

        Returns:
            Updated Repo object or None if not found.
        """
        db_repo = await self.dao.get(repo_id)
        if not db_repo:
            return None

        workspace_path = Path(db_repo.workspace_path)
        if not workspace_path.exists():
            return None

        repo = git.Repo(workspace_path)
        repo.remotes.origin.pull()

        return db_repo

    def create_working_copy(self, repo: Repo, run_id: str) -> Path:
        """Create a working copy of a repository for a run.

        Args:
            repo: Repository object.
            run_id: Run ID for the working copy.

        Returns:
            Path to the working copy.
        """
        source_path = Path(repo.workspace_path)
        target_path = self.workspaces_dir / f"run_{run_id}"

        # Copy the workspace (excluding .git for speed, we'll init fresh)
        shutil.copytree(
            source_path,
            target_path,
            ignore=shutil.ignore_patterns(".git"),
        )

        # Initialize a fresh git repo
        git.Repo.init(target_path)
        work_repo = git.Repo(target_path)
        work_repo.git.add(".")
        work_repo.index.commit("Initial state")

        return target_path

    def cleanup_working_copy(self, run_id: str) -> None:
        """Clean up a working copy after a run.

        Args:
            run_id: Run ID of the working copy.
        """
        target_path = self.workspaces_dir / f"run_{run_id}"
        if target_path.exists():
            shutil.rmtree(target_path)
