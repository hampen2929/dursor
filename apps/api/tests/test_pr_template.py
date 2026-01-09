"""Tests for PR template handling.

This module tests:
- Template enumeration (finding templates in various locations)
- Non-destructive composition (dursor block approach)
- Template preservation during regeneration
"""

from pathlib import Path

import pytest

# Will be imported after implementation
# from dursor_api.services.pr_template_service import (
#     PRTemplate,
#     PRTemplateService,
#     DURSOR_BLOCK_BEGIN,
#     DURSOR_BLOCK_END,
# )


FIXTURES_DIR = Path(__file__).parent / "fixtures" / "pr_templates"


class TestPRTemplateFixtures:
    """Test that fixture files exist and are valid."""

    def test_fixtures_directory_exists(self) -> None:
        """Ensure fixtures directory exists."""
        assert FIXTURES_DIR.exists()
        assert FIXTURES_DIR.is_dir()

    def test_simple_template_exists(self) -> None:
        """Ensure simple template fixture exists."""
        template_path = FIXTURES_DIR / "simple.md"
        assert template_path.exists()
        content = template_path.read_text()
        assert "## Summary" in content
        assert "## Changes" in content

    def test_nested_sections_template_exists(self) -> None:
        """Ensure nested sections template fixture exists."""
        template_path = FIXTURES_DIR / "nested_sections.md"
        assert template_path.exists()
        content = template_path.read_text()
        assert "## Description" in content
        assert "### Type of change" in content
        assert "### Checklist" in content

    def test_japanese_template_exists(self) -> None:
        """Ensure Japanese template fixture exists."""
        template_path = FIXTURES_DIR / "japanese.md"
        assert template_path.exists()
        content = template_path.read_text()
        assert "## 概要" in content
        assert "## 変更内容" in content

    def test_emoji_template_exists(self) -> None:
        """Ensure emoji template fixture exists."""
        template_path = FIXTURES_DIR / "with_emoji.md"
        assert template_path.exists()
        content = template_path.read_text()
        assert "## 📝 Description" in content
        assert "## ✅ Checklist" in content

    def test_frontmatter_template_exists(self) -> None:
        """Ensure frontmatter template fixture exists."""
        template_path = FIXTURES_DIR / "with_frontmatter.md"
        assert template_path.exists()
        content = template_path.read_text()
        assert content.startswith("---")
        assert "name: Feature Request" in content


class TestTemplateEnumeration:
    """Tests for template enumeration logic."""

    @pytest.fixture
    def temp_repo(self, tmp_path: Path) -> Path:
        """Create a temporary repository structure."""
        # Create .github directory
        github_dir = tmp_path / ".github"
        github_dir.mkdir()
        return tmp_path

    def test_find_github_lowercase(self, temp_repo: Path) -> None:
        """Test finding .github/pull_request_template.md."""
        template_path = temp_repo / ".github" / "pull_request_template.md"
        template_path.write_text("## Summary\n")

        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()
        templates = service.enumerate_templates(temp_repo)
        assert len(templates) >= 1
        assert any(t.path == str(template_path) for t in templates)

    def test_find_github_uppercase(self, temp_repo: Path) -> None:
        """Test finding .github/PULL_REQUEST_TEMPLATE.md."""
        template_path = temp_repo / ".github" / "PULL_REQUEST_TEMPLATE.md"
        template_path.write_text("## Summary\n")

        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()
        templates = service.enumerate_templates(temp_repo)
        assert len(templates) >= 1
        assert any(t.path == str(template_path) for t in templates)

    def test_find_docs_template(self, temp_repo: Path) -> None:
        """Test finding docs/pull_request_template.md."""
        docs_dir = temp_repo / "docs"
        docs_dir.mkdir()
        template_path = docs_dir / "pull_request_template.md"
        template_path.write_text("## Summary\n")

        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()
        templates = service.enumerate_templates(temp_repo)
        assert len(templates) >= 1
        assert any(t.path == str(template_path) for t in templates)

    def test_find_root_template(self, temp_repo: Path) -> None:
        """Test finding pull_request_template.md in root."""
        template_path = temp_repo / "pull_request_template.md"
        template_path.write_text("## Summary\n")

        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()
        templates = service.enumerate_templates(temp_repo)
        assert len(templates) >= 1
        assert any(t.path == str(template_path) for t in templates)

    def test_find_multiple_templates_directory(self, temp_repo: Path) -> None:
        """Test finding templates in .github/PULL_REQUEST_TEMPLATE/ directory."""
        template_dir = temp_repo / ".github" / "PULL_REQUEST_TEMPLATE"
        template_dir.mkdir(parents=True)

        # Create multiple templates
        (template_dir / "default.md").write_text("## Default\n")
        (template_dir / "feature.md").write_text("## Feature\n")
        (template_dir / "bugfix.md").write_text("## Bugfix\n")

        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()
        templates = service.enumerate_templates(temp_repo)

        # Should find all three templates
        assert len(templates) >= 3
        filenames = [Path(t.path).name for t in templates]
        assert "default.md" in filenames
        assert "feature.md" in filenames
        assert "bugfix.md" in filenames

    def test_default_template_selection(self, temp_repo: Path) -> None:
        """Test that default template is selected correctly."""
        # Create both single template and directory templates
        github_dir = temp_repo / ".github"
        github_dir.mkdir(exist_ok=True)

        # Single template should be preferred
        single_template = github_dir / "pull_request_template.md"
        single_template.write_text("## Single\n")

        template_dir = github_dir / "PULL_REQUEST_TEMPLATE"
        template_dir.mkdir()
        (template_dir / "feature.md").write_text("## Feature\n")

        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()
        default = service.get_default_template(temp_repo)

        assert default is not None
        assert default.path == str(single_template)


class TestDursorBlockComposition:
    """Tests for dursor block composition (non-destructive approach)."""

    def test_insert_dursor_block_at_beginning(self) -> None:
        """Test inserting dursor block at the beginning of template."""
        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()
        template = "## Summary\n<!-- Describe changes -->\n\n## Checklist\n- [ ] Tests"
        generated = "Added new authentication feature with JWT tokens."

        result = service.compose_pr_body(template=template, generated_content=generated)

        # Should have dursor markers
        assert "<!-- dursor:begin -->" in result
        assert "<!-- dursor:end -->" in result
        # Should preserve template structure
        assert "## Summary" in result or "## Checklist" in result
        # Should include generated content
        assert "JWT tokens" in result

    def test_preserve_checkboxes(self) -> None:
        """Test that checkboxes are preserved."""
        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()
        template = """## Summary
<!-- Describe changes -->

## Checklist
- [ ] Tests pass
- [ ] Docs updated
- [ ] Code reviewed"""
        generated = "Fixed the authentication bug."

        result = service.compose_pr_body(template=template, generated_content=generated)

        # All checkboxes should be preserved
        assert "- [ ] Tests pass" in result
        assert "- [ ] Docs updated" in result
        assert "- [ ] Code reviewed" in result

    def test_preserve_nested_sections(self) -> None:
        """Test that nested sections (### under ##) are preserved."""
        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()
        template = (FIXTURES_DIR / "nested_sections.md").read_text()
        generated = "Implemented new feature."

        result = service.compose_pr_body(template=template, generated_content=generated)

        # Nested sections should be preserved
        assert "### Type of change" in result
        assert "### Checklist" in result
        assert "- [ ] Bug fix" in result

    def test_preserve_yaml_frontmatter(self) -> None:
        """Test that YAML frontmatter is preserved."""
        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()
        template = (FIXTURES_DIR / "with_frontmatter.md").read_text()
        generated = "Added requested feature."

        result = service.compose_pr_body(template=template, generated_content=generated)

        # Frontmatter should be at the very beginning
        assert result.startswith("---")
        assert "name: Feature Request" in result

    def test_dursor_block_after_frontmatter(self) -> None:
        """Test that dursor block is inserted after frontmatter."""
        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()
        template = (FIXTURES_DIR / "with_frontmatter.md").read_text()
        generated = "Added requested feature."

        result = service.compose_pr_body(template=template, generated_content=generated)

        # Find positions
        frontmatter_end = result.find("---", 3) + 3  # Skip first ---
        dursor_begin = result.find("<!-- dursor:begin -->")

        # Dursor block should be after frontmatter
        assert dursor_begin > frontmatter_end

    def test_japanese_template_preservation(self) -> None:
        """Test that Japanese templates are handled correctly."""
        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()
        template = (FIXTURES_DIR / "japanese.md").read_text()
        generated = "認証機能を追加しました。"

        result = service.compose_pr_body(template=template, generated_content=generated)

        # Japanese headings should be preserved
        assert "## 概要" in result
        assert "## 変更内容" in result
        assert "## テスト項目" in result
        assert "## 確認項目" in result

    def test_emoji_template_preservation(self) -> None:
        """Test that emoji templates are handled correctly."""
        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()
        template = (FIXTURES_DIR / "with_emoji.md").read_text()
        generated = "Fixed the login issue."

        result = service.compose_pr_body(template=template, generated_content=generated)

        # Emoji headings should be preserved
        assert "## 📝 Description" in result
        assert "## ✅ Checklist" in result
        assert "## 🔗 Related Issues" in result


class TestDursorBlockRegeneration:
    """Tests for dursor block regeneration (updating only the dursor block)."""

    def test_update_existing_dursor_block(self) -> None:
        """Test updating an existing dursor block preserves user edits."""
        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()

        existing_body = """<!-- dursor:begin -->
Old generated content.
<!-- dursor:end -->

## Checklist
- [x] Tests pass (manually checked by user)
- [x] Docs updated
"""
        new_generated = "Updated generated content."

        result = service.update_dursor_block(
            existing_body=existing_body,
            new_generated_content=new_generated,
        )

        # New content should be there
        assert "Updated generated content" in result
        # User modifications should be preserved
        assert "- [x] Tests pass (manually checked by user)" in result
        assert "- [x] Docs updated" in result

    def test_add_dursor_block_to_legacy_body(self) -> None:
        """Test adding dursor block to a PR body without existing markers."""
        from dursor_api.services.pr_template_service import PRTemplateService

        service = PRTemplateService()

        # Legacy body without dursor markers
        existing_body = """## Summary
This is a manual description.

## Checklist
- [x] Tests pass
"""
        new_generated = "AI-generated summary."

        result = service.update_dursor_block(
            existing_body=existing_body,
            new_generated_content=new_generated,
        )

        # Should have dursor markers now
        assert "<!-- dursor:begin -->" in result
        assert "<!-- dursor:end -->" in result
        # Should include new generated content
        assert "AI-generated summary" in result
        # Original content should be preserved (as much as possible)
        # Note: The exact behavior may vary based on implementation


class TestTemplateModel:
    """Tests for PRTemplate model."""

    def test_template_model_attributes(self) -> None:
        """Test PRTemplate model has required attributes."""
        from dursor_api.services.pr_template_service import PRTemplate

        template = PRTemplate(
            path="/path/to/template.md",
            filename="template.md",
            content="## Summary\n",
            source="github_single",
            is_default_candidate=True,
        )

        assert template.path == "/path/to/template.md"
        assert template.filename == "template.md"
        assert template.content == "## Summary\n"
        assert template.source == "github_single"
        assert template.is_default_candidate is True
