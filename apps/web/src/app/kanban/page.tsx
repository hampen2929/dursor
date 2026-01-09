'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import Link from 'next/link';
import { tasksApi } from '@/lib/api';
import { Task, TaskStatus } from '@/types';
import { formatRelativeTime, cn } from '@/lib/utils';
import { ChevronDownIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';

const STATUS_COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog', color: 'bg-gray-800/30' },
  { id: 'todo', label: 'ToDo', color: 'bg-blue-900/10' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-yellow-900/10' },
  { id: 'in_review', label: 'In Review', color: 'bg-purple-900/10' },
  { id: 'done', label: 'Done', color: 'bg-green-900/10' },
  { id: 'archived', label: 'Archived', color: 'bg-red-900/10' },
];

export default function KanbanPage() {
  const { data: tasks, isLoading } = useSWR('tasks', () => tasksApi.list(), {
    refreshInterval: 5000,
  });

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      // Optimistic update
      mutate(
        'tasks',
        (currentTasks: Task[] | undefined) => {
          if (!currentTasks) return [];
          return currentTasks.map((t) =>
            t.id === taskId ? { ...t, status: newStatus, updated_at: new Date().toISOString() } : t
          );
        },
        false
      );

      await tasksApi.update(taskId, { status: newStatus });
      mutate('tasks'); // Revalidate
    } catch (error) {
      console.error('Failed to update task status:', error);
      mutate('tasks'); // Revert on error
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-100px)] overflow-x-auto">
      <div className="flex gap-4 min-w-max p-4 h-full">
        {STATUS_COLUMNS.map((column) => (
          <div
            key={column.id}
            className={cn(
              'w-80 flex-shrink-0 flex flex-col rounded-xl border border-gray-800/50',
              column.color
            )}
          >
            {/* Header */}
            <div className="p-3 border-b border-gray-700/30 flex items-center justify-between sticky top-0 rounded-t-xl z-10 backdrop-blur-sm">
              <h3 className="font-semibold text-gray-300 text-sm tracking-wide uppercase">{column.label}</h3>
              <span className="text-xs font-mono text-gray-500 bg-gray-900/50 px-2 py-0.5 rounded-full border border-gray-800">
                {tasks?.filter((t) => (t.status || 'backlog') === column.id).length || 0}
              </span>
            </div>

            {/* Task List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {tasks
                ?.filter((t) => (t.status || 'backlog') === column.id)
                .map((task) => (
                  <div
                    key={task.id}
                    className="bg-gray-900 border border-gray-800 rounded-lg p-3 shadow-sm hover:border-gray-600 transition-colors group relative"
                  >
                    <Link
                      href={`/tasks/${task.id}`}
                      className="block text-sm font-medium text-gray-200 hover:text-blue-400 mb-3 line-clamp-3 leading-relaxed"
                    >
                      {task.title || 'Untitled Task'}
                    </Link>
                    
                    <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-800 pt-2 mt-2">
                      <span>{formatRelativeTime(task.updated_at)}</span>
                      
                      {/* Status Dropdown - using simple hover for now */}
                      <div className="relative group/menu">
                        <button className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-gray-300 transition-colors">
                           <EllipsisHorizontalIcon className="w-5 h-5" />
                        </button>
                         <div className="absolute right-0 top-full mt-1 w-36 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-20 hidden group-hover/menu:block hover:block">
                            <div className="py-1">
                                {STATUS_COLUMNS.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => handleStatusChange(task.id, s.id)}
                                        className={cn(
                                            "w-full text-left px-3 py-2 text-xs hover:bg-gray-700 transition-colors flex items-center gap-2",
                                            s.id === (task.status || 'backlog') 
                                                ? "text-blue-400 bg-gray-700/30 font-medium" 
                                                : "text-gray-400"
                                        )}
                                    >
                                        <span className={cn("w-2 h-2 rounded-full", s.id === 'done' ? 'bg-green-500' : s.id === 'in_progress' ? 'bg-yellow-500' : 'bg-gray-600')} />
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                         </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
