'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reposApi, tasksApi, modelsApi } from '@/lib/api';
import type { ModelProfile } from '@/types';
import useSWR from 'swr';

export default function HomePage() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: models } = useSWR('models', modelsApi.list);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Clone the repository
      const repo = await reposApi.clone({ repo_url: repoUrl.trim() });

      // Create a new task
      const task = await tasksApi.create({
        repo_id: repo.id,
        title: `Task for ${repo.repo_url}`,
      });

      // Navigate to the task page
      router.push(`/tasks/${task.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone repository');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">dursor</h1>
        <p className="text-gray-400 text-lg">
          Multi-model parallel coding agent
        </p>
        <p className="text-gray-500 mt-2">
          Compare outputs from different models. Choose the best. Create PRs.
        </p>
      </div>

      {/* Model Status */}
      <div className="mb-8 p-4 bg-gray-900 rounded-lg border border-gray-800">
        <h2 className="text-sm font-medium text-gray-400 mb-3">
          Configured Models
        </h2>
        {!models || models.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No models configured.{' '}
            <a href="/settings" className="text-blue-400 hover:underline">
              Add API keys
            </a>{' '}
            to get started.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {models.map((model) => (
              <span
                key={model.id}
                className="px-2 py-1 bg-gray-800 rounded text-sm text-gray-300"
              >
                {model.display_name || model.model_name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Repository Input */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="repo-url"
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            GitHub Repository URL
          </label>
          <input
            id="repo-url"
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500"
            disabled={loading}
          />
        </div>

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !repoUrl.trim()}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
        >
          {loading ? 'Cloning Repository...' : 'Start New Task'}
        </button>
      </form>

      {/* Recent Tasks */}
      <div className="mt-12">
        <h2 className="text-lg font-medium mb-4">Recent Tasks</h2>
        <RecentTasks />
      </div>
    </div>
  );
}

function RecentTasks() {
  const { data: tasks, error } = useSWR('tasks', () => tasksApi.list());

  if (error) {
    return (
      <p className="text-gray-500 text-sm">Failed to load recent tasks.</p>
    );
  }

  if (!tasks) {
    return <p className="text-gray-500 text-sm">Loading...</p>;
  }

  if (tasks.length === 0) {
    return <p className="text-gray-500 text-sm">No tasks yet.</p>;
  }

  return (
    <div className="space-y-2">
      {tasks.slice(0, 5).map((task) => (
        <a
          key={task.id}
          href={`/tasks/${task.id}`}
          className="block p-4 bg-gray-900 hover:bg-gray-800 rounded-lg border border-gray-800 transition-colors"
        >
          <div className="font-medium">{task.title || 'Untitled Task'}</div>
          <div className="text-sm text-gray-500 mt-1">
            {new Date(task.updated_at).toLocaleString()}
          </div>
        </a>
      ))}
    </div>
  );
}
