'use client';

import { useState } from 'react';
import { prsApi } from '@/lib/api';
import type { Run } from '@/types';
import { DiffViewer } from '@/components/DiffViewer';

interface RunDetailPanelProps {
  run: Run;
  taskId: string;
  onPRCreated: () => void;
}

type Tab = 'summary' | 'diff' | 'logs';

export function RunDetailPanel({
  run,
  taskId,
  onPRCreated,
}: RunDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('diff');
  const [showPRForm, setShowPRForm] = useState(false);
  const [prTitle, setPRTitle] = useState('');
  const [prBody, setPRBody] = useState('');
  const [creating, setCreating] = useState(false);
  const [prResult, setPRResult] = useState<{ url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreatePR = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prTitle.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const result = await prsApi.create(taskId, {
        selected_run_id: run.id,
        title: prTitle.trim(),
        body: prBody.trim() || undefined,
      });
      setPRResult(result);
      onPRCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PR');
    } finally {
      setCreating(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'diff', label: 'Diff' },
    { id: 'logs', label: 'Logs' },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg border border-gray-800">
      {/* Header */}
      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="font-medium">{run.model_name}</h2>
          <div className="text-xs text-gray-500">{run.provider}</div>
        </div>
        {run.status === 'succeeded' && run.patch && (
          <button
            onClick={() => setShowPRForm(!showPRForm)}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
          >
            Create PR
          </button>
        )}
      </div>

      {/* PR Form */}
      {showPRForm && (
        <div className="p-3 border-b border-gray-800 bg-gray-800/50">
          {prResult ? (
            <div className="text-center py-2">
              <p className="text-green-400 mb-2">PR created successfully!</p>
              <a
                href={prResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                View PR on GitHub
              </a>
            </div>
          ) : (
            <form onSubmit={handleCreatePR} className="space-y-3">
              <input
                type="text"
                value={prTitle}
                onChange={(e) => setPRTitle(e.target.value)}
                placeholder="PR title"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                value={prBody}
                onChange={(e) => setPRBody(e.target.value)}
                placeholder="PR description (optional)"
                rows={2}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {error && (
                <p className="text-red-400 text-xs">{error}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creating || !prTitle.trim()}
                  className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 rounded text-sm transition-colors"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPRForm(false)}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {run.status === 'running' && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-400">Running...</p>
            </div>
          </div>
        )}

        {run.status === 'queued' && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">Waiting in queue...</p>
          </div>
        )}

        {run.status === 'failed' && (
          <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg">
            <h3 className="font-medium text-red-400 mb-2">Execution Failed</h3>
            <p className="text-sm text-red-300">{run.error}</p>
          </div>
        )}

        {run.status === 'succeeded' && (
          <>
            {activeTab === 'summary' && (
              <div>
                <h3 className="font-medium mb-3">Summary</h3>
                <p className="text-gray-300">{run.summary}</p>

                {run.warnings.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-yellow-400 mb-2">
                      Warnings
                    </h4>
                    <ul className="list-disc list-inside text-sm text-yellow-300">
                      {run.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {run.files_changed.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">
                      Files Changed ({run.files_changed.length})
                    </h4>
                    <ul className="space-y-1">
                      {run.files_changed.map((f, i) => (
                        <li
                          key={i}
                          className="text-sm text-gray-400 flex items-center justify-between"
                        >
                          <span className="font-mono">{f.path}</span>
                          <span className="text-xs">
                            <span className="text-green-400">
                              +{f.added_lines}
                            </span>
                            {' / '}
                            <span className="text-red-400">
                              -{f.removed_lines}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'diff' && (
              <DiffViewer patch={run.patch || ''} />
            )}

            {activeTab === 'logs' && (
              <div className="font-mono text-xs space-y-1">
                {run.logs.length === 0 && (
                  <p className="text-gray-500">No logs available.</p>
                )}
                {run.logs.map((log, i) => (
                  <div key={i} className="text-gray-400">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
