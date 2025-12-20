'use client';

import type { Run, RunStatus } from '@/types';

interface RunsPanelProps {
  runs: Run[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}

const STATUS_COLORS: Record<RunStatus, string> = {
  queued: 'bg-gray-500',
  running: 'bg-yellow-500 animate-pulse',
  succeeded: 'bg-green-500',
  failed: 'bg-red-500',
  canceled: 'bg-gray-600',
};

const STATUS_LABELS: Record<RunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Completed',
  failed: 'Failed',
  canceled: 'Canceled',
};

export function RunsPanel({
  runs,
  selectedRunId,
  onSelectRun,
}: RunsPanelProps) {
  // Group runs by instruction (same batch)
  const groupedRuns: { instruction: string; runs: Run[] }[] = [];
  let currentInstruction = '';
  let currentGroup: Run[] = [];

  for (const run of runs) {
    if (run.instruction !== currentInstruction) {
      if (currentGroup.length > 0) {
        groupedRuns.push({ instruction: currentInstruction, runs: currentGroup });
      }
      currentInstruction = run.instruction;
      currentGroup = [run];
    } else {
      currentGroup.push(run);
    }
  }
  if (currentGroup.length > 0) {
    groupedRuns.push({ instruction: currentInstruction, runs: currentGroup });
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg border border-gray-800">
      <div className="p-3 border-b border-gray-800">
        <h2 className="font-medium">Runs</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {groupedRuns.length === 0 && (
          <p className="text-gray-500 text-sm text-center p-4">
            No runs yet. Enter instructions to start.
          </p>
        )}

        {groupedRuns.map((group, groupIndex) => (
          <div key={groupIndex}>
            <div className="text-xs text-gray-500 px-2 mb-2 truncate">
              {group.instruction.slice(0, 50)}
              {group.instruction.length > 50 ? '...' : ''}
            </div>
            <div className="space-y-1">
              {group.runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => onSelectRun(run.id)}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${
                    selectedRunId === run.id
                      ? 'bg-blue-900/40 border border-blue-700'
                      : 'bg-gray-800 hover:bg-gray-750 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {run.model_name}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${STATUS_COLORS[run.status]}`}
                      title={STATUS_LABELS[run.status]}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {run.provider}
                  </div>
                  {run.status === 'succeeded' && run.summary && (
                    <div className="text-xs text-gray-400 mt-2 line-clamp-2">
                      {run.summary}
                    </div>
                  )}
                  {run.status === 'failed' && run.error && (
                    <div className="text-xs text-red-400 mt-2 line-clamp-2">
                      {run.error}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
