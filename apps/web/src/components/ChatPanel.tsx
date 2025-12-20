'use client';

import { useState, useRef, useEffect } from 'react';
import { tasksApi, runsApi } from '@/lib/api';
import type { Message, ModelProfile } from '@/types';

interface ChatPanelProps {
  taskId: string;
  messages: Message[];
  models: ModelProfile[];
  onRunsCreated: () => void;
}

export function ChatPanel({
  taskId,
  messages,
  models,
  onRunsCreated,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Select all models by default
  useEffect(() => {
    if (models.length > 0 && selectedModels.length === 0) {
      setSelectedModels(models.map((m) => m.id));
    }
  }, [models, selectedModels.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || selectedModels.length === 0) return;

    setLoading(true);

    try {
      // Add user message
      await tasksApi.addMessage(taskId, {
        role: 'user',
        content: input.trim(),
      });

      // Create runs for selected models
      await runsApi.create(taskId, {
        instruction: input.trim(),
        model_ids: selectedModels,
      });

      setInput('');
      onRunsCreated();
    } catch (err) {
      console.error('Failed to create runs:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId]
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg border border-gray-800">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm text-center">
            Start by entering your instructions below.
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-3 rounded-lg ${
              msg.role === 'user'
                ? 'bg-blue-900/30 border border-blue-800 ml-8'
                : 'bg-gray-800 mr-8'
            }`}
          >
            <div className="text-xs text-gray-500 mb-1 capitalize">
              {msg.role}
            </div>
            <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Model Selection */}
      <div className="border-t border-gray-800 p-3">
        <div className="text-xs text-gray-500 mb-2">Select models to run:</div>
        <div className="flex flex-wrap gap-2">
          {models.map((model) => (
            <label
              key={model.id}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                selectedModels.includes(model.id)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedModels.includes(model.id)}
                onChange={() => toggleModel(model.id)}
                className="sr-only"
              />
              {model.display_name || model.model_name}
            </label>
          ))}
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-gray-800 p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter your instructions..."
            rows={3}
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) {
                handleSubmit(e);
              }
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim() || selectedModels.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded font-medium transition-colors self-end"
          >
            {loading ? '...' : 'Run'}
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Cmd+Enter to submit
        </div>
      </form>
    </div>
  );
}
