'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { modelsApi } from '@/lib/api';
import type { Provider, ModelProfileCreate } from '@/types';

const PROVIDERS: { value: Provider; label: string; models: string[] }[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini'],
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  },
  {
    value: 'google',
    label: 'Google',
    models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
];

export default function SettingsPage() {
  const { data: models, error } = useSWR('models', modelsApi.list);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Model Profiles */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Model Profiles</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
          >
            {showForm ? 'Cancel' : 'Add Model'}
          </button>
        </div>

        {showForm && (
          <AddModelForm onSuccess={() => setShowForm(false)} />
        )}

        {error && (
          <p className="text-red-400 text-sm">Failed to load models.</p>
        )}

        {models && models.length === 0 && !showForm && (
          <p className="text-gray-500 text-sm">
            No models configured. Add your API keys to get started.
          </p>
        )}

        {models && models.length > 0 && (
          <div className="space-y-2 mt-4">
            {models.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between p-4 bg-gray-900 rounded-lg border border-gray-800"
              >
                <div>
                  <div className="font-medium">
                    {model.display_name || model.model_name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {model.provider} / {model.model_name}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await modelsApi.delete(model.id);
                    mutate('models');
                  }}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AddModelForm({ onSuccess }: { onSuccess: () => void }) {
  const [provider, setProvider] = useState<Provider>('openai');
  const [modelName, setModelName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProvider = PROVIDERS.find((p) => p.value === provider);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelName || !apiKey) return;

    setLoading(true);
    setError(null);

    try {
      const data: ModelProfileCreate = {
        provider,
        model_name: modelName,
        api_key: apiKey,
      };
      if (displayName) {
        data.display_name = displayName;
      }

      await modelsApi.create(data);
      mutate('models');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add model');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 bg-gray-900 rounded-lg border border-gray-800 space-y-4"
    >
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Provider
        </label>
        <select
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value as Provider);
            setModelName('');
          }}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Model
        </label>
        <select
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a model</option>
          {selectedProvider?.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Display Name (optional)
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g., GPT-4o (fast)"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-800 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !modelName || !apiKey}
        className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded font-medium transition-colors"
      >
        {loading ? 'Adding...' : 'Add Model'}
      </button>
    </form>
  );
}
