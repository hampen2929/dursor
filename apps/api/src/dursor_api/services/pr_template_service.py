"""PR Template service for template enumeration and composition.

This service handles:
- Enumeration of PR templates from various locations
- Non-destructive composition using dursor blocks
- Template selection logic
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

# Dursor block markers
DURSOR_BLOCK_BEGIN = "<!-- dursor:begin -->"
DURSOR_BLOCK_END = "<!-- dursor:end -->"


class TemplateSource(str, Enum):
    """Source location of a PR template."""

    GITHUB_SINGLE = "github_single"  # .github/pull_request_template.md
    GITHUB_MULTI = "github_multi"  # .github/PULL_REQUEST_TEMPLATE/*.md
    DOCS = "docs"  # docs/pull_request_template.md
    ROOT = "root"  # pull_request_template.md in root


@dataclass
class PRTemplate:
    """Represents a PR template file."""

    path: str
    filename: str
    content: str
    source: str
    is_default_candidate: bool


class PRTemplateService:
    """Service for managing PR templates.

    This service provides:
    - Template enumeration from various standard locations
    - Default template selection logic
    - Non-destructive composition using dursor blocks
    - Dursor block update for regeneration
    """

    # Template paths in priority order (case-insensitive matching)
    SINGLE_TEMPLATE_PATHS = [
        (".github", "pull_request_template.md"),
        (".github", "PULL_REQUEST_TEMPLATE.md"),
        ("", "pull_request_template.md"),
        ("", "PULL_REQUEST_TEMPLATE.md"),
        ("docs", "pull_request_template.md"),
        ("docs", "PULL_REQUEST_TEMPLATE.md"),
    ]

    MULTI_TEMPLATE_DIR = ".github/PULL_REQUEST_TEMPLATE"

    def enumerate_templates(self, workspace_path: Path) -> list[PRTemplate]:
        """Enumerate all PR templates in the repository.

        Searches in the following locations (in priority order):
        1. .github/pull_request_template.md (case-insensitive)
        2. .github/PULL_REQUEST_TEMPLATE.md
        3. pull_request_template.md (root)
        4. PULL_REQUEST_TEMPLATE.md (root)
        5. docs/pull_request_template.md
        6. .github/PULL_REQUEST_TEMPLATE/*.md (multiple templates)

        Args:
            workspace_path: Path to the repository workspace.

        Returns:
            List of PRTemplate objects found.
        """
        templates: list[PRTemplate] = []
        found_paths: set[str] = set()

        # Search single template locations
        for dir_path, filename in self.SINGLE_TEMPLATE_PATHS:
            template = self._find_template_case_insensitive(
                workspace_path,
                dir_path,
                filename,
            )
            if template and template.path not in found_paths:
                templates.append(template)
                found_paths.add(template.path)

        # Search multiple template directory (check case variations)
        for dir_name in ["PULL_REQUEST_TEMPLATE", "pull_request_template"]:
            check_dir = workspace_path / ".github" / dir_name
            if check_dir.exists() and check_dir.is_dir():
                for md_file in check_dir.glob("*.md"):
                    if str(md_file) not in found_paths:
                        templates.append(
                            PRTemplate(
                                path=str(md_file),
                                filename=md_file.name,
                                content=md_file.read_text(),
                                source=TemplateSource.GITHUB_MULTI.value,
                                is_default_candidate=md_file.name.lower() == "default.md",
                            )
                        )
                        found_paths.add(str(md_file))

        return templates

    def _find_template_case_insensitive(
        self,
        workspace_path: Path,
        dir_path: str,
        filename: str,
    ) -> PRTemplate | None:
        """Find a template file with case-insensitive matching.

        Args:
            workspace_path: Repository workspace path.
            dir_path: Directory relative to workspace (empty for root).
            filename: Expected filename (case-insensitive).

        Returns:
            PRTemplate if found, None otherwise.
        """
        if dir_path:
            search_dir = workspace_path / dir_path
        else:
            search_dir = workspace_path

        if not search_dir.exists():
            return None

        # Try exact match first
        exact_path = search_dir / filename
        if exact_path.exists() and exact_path.is_file():
            source = self._determine_source(dir_path)
            return PRTemplate(
                path=str(exact_path),
                filename=exact_path.name,
                content=exact_path.read_text(),
                source=source,
                is_default_candidate=True,
            )

        # Case-insensitive search
        filename_lower = filename.lower()
        for item in search_dir.iterdir():
            if item.is_file() and item.name.lower() == filename_lower:
                source = self._determine_source(dir_path)
                return PRTemplate(
                    path=str(item),
                    filename=item.name,
                    content=item.read_text(),
                    source=source,
                    is_default_candidate=True,
                )

        return None

    def _determine_source(self, dir_path: str) -> str:
        """Determine the template source based on directory path."""
        if dir_path == ".github":
            return TemplateSource.GITHUB_SINGLE.value
        elif dir_path == "docs":
            return TemplateSource.DOCS.value
        elif dir_path == "":
            return TemplateSource.ROOT.value
        return TemplateSource.GITHUB_SINGLE.value

    def get_default_template(self, workspace_path: Path) -> PRTemplate | None:
        """Get the default template for the repository.

        Selection rules (in priority order):
        1. Single template (.github/pull_request_template.md, etc.) takes precedence
        2. .github/PULL_REQUEST_TEMPLATE/default.md
        3. If only one template in PULL_REQUEST_TEMPLATE/, use that
        4. First template alphabetically

        Args:
            workspace_path: Path to the repository workspace.

        Returns:
            Default PRTemplate or None if no templates found.
        """
        templates = self.enumerate_templates(workspace_path)
        if not templates:
            return None

        # Priority 1: Single templates (not from multi-template directory)
        single_templates = [t for t in templates if t.source != TemplateSource.GITHUB_MULTI.value]
        if single_templates:
            return single_templates[0]

        # Priority 2: default.md in multi-template directory
        default_templates = [t for t in templates if t.is_default_candidate]
        if default_templates:
            return default_templates[0]

        # Priority 3: Only one template in multi-directory
        if len(templates) == 1:
            return templates[0]

        # Priority 4: Sort alphabetically and pick first
        sorted_templates = sorted(templates, key=lambda t: t.filename.lower())
        return sorted_templates[0]

    def get_template_by_path(self, workspace_path: Path, template_path: str) -> PRTemplate | None:
        """Get a specific template by its path.

        Args:
            workspace_path: Path to the repository workspace.
            template_path: Path to the template (absolute or relative to workspace).

        Returns:
            PRTemplate if found, None otherwise.
        """
        templates = self.enumerate_templates(workspace_path)

        for template in templates:
            if template.path == template_path or template.path.endswith(template_path):
                return template

        return None

    def compose_pr_body(
        self,
        template: str,
        generated_content: str,
        title: str | None = None,
    ) -> str:
        """Compose PR body using template and generated content.

        This uses the dursor block approach for non-destructive composition:
        - Template structure is fully preserved
        - Generated content is wrapped in dursor markers
        - Insertion point is after YAML frontmatter (if present) or at the beginning

        Args:
            template: The PR template content.
            generated_content: AI-generated content to insert.
            title: Optional PR title.

        Returns:
            Composed PR body with dursor block.
        """
        template = template.replace("\r\n", "\n").strip()
        generated_content = generated_content.strip()

        if not template:
            return self._wrap_in_dursor_block(generated_content)

        if not generated_content:
            return template

        # Build the dursor block content
        dursor_block = self._wrap_in_dursor_block(generated_content)

        # Check for YAML frontmatter
        frontmatter_match = re.match(r"^---\n.*?\n---\n?", template, re.DOTALL)

        if frontmatter_match:
            # Insert after frontmatter
            frontmatter = frontmatter_match.group(0)
            rest = template[len(frontmatter) :].lstrip()
            return f"{frontmatter}\n{dursor_block}\n\n{rest}".strip()
        else:
            # Insert at beginning
            return f"{dursor_block}\n\n{template}".strip()

    def _wrap_in_dursor_block(self, content: str) -> str:
        """Wrap content in dursor block markers.

        Args:
            content: Content to wrap.

        Returns:
            Content wrapped in dursor markers.
        """
        return f"{DURSOR_BLOCK_BEGIN}\n{content}\n{DURSOR_BLOCK_END}"

    def update_dursor_block(
        self,
        existing_body: str,
        new_generated_content: str,
    ) -> str:
        """Update the dursor block in an existing PR body.

        If a dursor block exists, replaces only its content.
        If no dursor block exists, adds one at the beginning.

        Args:
            existing_body: Current PR body.
            new_generated_content: New content to put in the dursor block.

        Returns:
            Updated PR body with new dursor block content.
        """
        existing_body = existing_body.replace("\r\n", "\n")
        new_generated_content = new_generated_content.strip()

        new_block = self._wrap_in_dursor_block(new_generated_content)

        # Check if dursor block exists
        pattern = re.compile(
            rf"{re.escape(DURSOR_BLOCK_BEGIN)}.*?{re.escape(DURSOR_BLOCK_END)}",
            re.DOTALL,
        )
        match = pattern.search(existing_body)

        if match:
            # Replace existing block
            return pattern.sub(new_block, existing_body, count=1)
        else:
            # No existing block - add at beginning (after frontmatter if present)
            frontmatter_match = re.match(r"^---\n.*?\n---\n?", existing_body, re.DOTALL)

            if frontmatter_match:
                frontmatter = frontmatter_match.group(0)
                rest = existing_body[len(frontmatter) :].lstrip()
                return f"{frontmatter}\n{new_block}\n\n{rest}".strip()
            else:
                return f"{new_block}\n\n{existing_body}".strip()

    def extract_dursor_block_content(self, body: str) -> str | None:
        """Extract the content inside a dursor block.

        Args:
            body: PR body text.

        Returns:
            Content inside dursor block, or None if not found.
        """
        pattern = re.compile(
            rf"{re.escape(DURSOR_BLOCK_BEGIN)}\n?(.*?)\n?{re.escape(DURSOR_BLOCK_END)}",
            re.DOTALL,
        )
        match = pattern.search(body)
        return match.group(1).strip() if match else None

    def has_dursor_block(self, body: str) -> bool:
        """Check if a PR body contains a dursor block.

        Args:
            body: PR body text.

        Returns:
            True if dursor block markers are present.
        """
        return DURSOR_BLOCK_BEGIN in body and DURSOR_BLOCK_END in body
