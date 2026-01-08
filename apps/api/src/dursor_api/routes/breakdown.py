"""Task breakdown routes."""

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from dursor_api.dependencies import get_breakdown_service
from dursor_api.domain.models import TaskBreakdownRequest, TaskBreakdownResponse
from dursor_api.services.breakdown_service import BreakdownService

router = APIRouter(prefix="/breakdown", tags=["breakdown"])


class BreakdownLogsResponse(BaseModel):
    """Response for breakdown logs."""

    logs: list[dict[str, Any]]
    is_complete: bool
    total_lines: int


@router.post("", response_model=TaskBreakdownResponse, status_code=201)
async def breakdown_tasks(
    request: TaskBreakdownRequest,
    breakdown_service: BreakdownService = Depends(get_breakdown_service),
) -> TaskBreakdownResponse:
    """Break down hearing content into development tasks.

    This endpoint uses an AI agent (Claude Code, Codex, or Gemini CLI)
    to analyze the codebase and decompose the provided hearing content
    into specific, actionable development tasks.

    Args:
        request: Breakdown request with content and executor type.
        breakdown_service: Breakdown service instance.

    Returns:
        TaskBreakdownResponse with decomposed tasks.
    """
    return await breakdown_service.breakdown(request)


@router.get("/{breakdown_id}/logs", response_model=BreakdownLogsResponse)
async def get_breakdown_logs(
    breakdown_id: str,
    from_line: int = 0,
    breakdown_service: BreakdownService = Depends(get_breakdown_service),
) -> BreakdownLogsResponse:
    """Get logs for a breakdown session.

    This endpoint is used for polling the breakdown execution logs.
    Clients can use from_line to get only new logs since the last poll.

    Args:
        breakdown_id: Breakdown session ID.
        from_line: Line number to start from (0-based).
        breakdown_service: Breakdown service instance.

    Returns:
        BreakdownLogsResponse with logs and completion status.
    """
    logs, is_complete = await breakdown_service.get_logs(breakdown_id, from_line)
    return BreakdownLogsResponse(
        logs=logs,
        is_complete=is_complete,
        total_lines=len(logs) + from_line,
    )
