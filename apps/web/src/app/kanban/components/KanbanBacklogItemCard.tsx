'use client';

import Link from 'next/link';
import type { BacklogItem } from '@/types';
import {
  ClipboardDocumentListIcon,
  SparklesIcon,
  WrenchScrewdriverIcon,
  DocumentTextIcon,
  BeakerIcon,
  BugAntIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

interface KanbanBacklogItemCardProps {
  item: BacklogItem;
  onStartWork: (itemId: string) => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

const TYPE_ICONS = {
  feature: SparklesIcon,
  bug_fix: BugAntIcon,
  refactoring: WrenchScrewdriverIcon,
  docs: DocumentTextIcon,
  test: BeakerIcon,
};

const SIZE_COLORS = {
  small: 'text-green-400 bg-green-900/30',
  medium: 'text-yellow-400 bg-yellow-900/30',
  large: 'text-red-400 bg-red-900/30',
};

export function KanbanBacklogItemCard({
  item,
  onStartWork,
}: KanbanBacklogItemCardProps) {
  const TypeIcon = TYPE_ICONS[item.type] || ClipboardDocumentListIcon;

  return (
    <div className="block p-3 bg-purple-900/20 rounded-lg hover:bg-purple-900/30 transition-colors border border-purple-700/50 hover:border-purple-600/50">
      <div className="flex items-start gap-2">
        <TypeIcon className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <Link
            href="/backlog"
            className="font-medium text-sm text-white truncate block hover:text-purple-300 transition-colors"
          >
            {item.title}
          </Link>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs">
        <span
          className={cn(
            'px-1.5 py-0.5 rounded text-xs',
            SIZE_COLORS[item.estimated_size]
          )}
        >
          {item.estimated_size}
        </span>
        {item.subtasks.length > 0 && (
          <span className="text-gray-500">
            {item.subtasks.filter((s) => s.completed).length}/{item.subtasks.length} subtasks
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-gray-600">
          {formatRelativeTime(item.updated_at)}
        </span>

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onStartWork(item.id);
          }}
          className="text-xs text-green-400 hover:text-green-300 transition-colors"
        >
          Start Work
        </button>
      </div>
    </div>
  );
}
