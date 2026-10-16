/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { TimerCircle } from './components/TimerCircle';
import { TaskList } from './components/TaskList';
import { AudioPlayer } from './components/AudioPlayer';
import { SyncModal } from './components/SyncModal';
import { WeeklyStats } from './components/WeeklyStats';
import { Task, createTask, toggleTask, updateTaskTitle, deleteTask, normalizeTasks } from './utils/tasks';
import { mergeTasks, isValidSyncKey, normalizeSyncKey } from './utils/sync';
import { recordPomodoroCompletion, getSampleWeeklyStats } from './utils/stats';
import { playWorkCompleteChime, playBreakCompleteChime, playClickSound } from './utils/audio';

export default function App() {
  // Navigation tab state: 'timer' or 'stats'
  const [activeTab, setActiveTab] = useState<'timer' | 'stats'>('timer');

  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pomodoro_theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  // Sync html class for dark mode
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('pomodoro_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('pomodoro_theme', 'light');
    }
  }, [isDark]);

  // Durations in minutes
  const [workMinutes, setWorkMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('pomodoro_work_duration');
    return saved ? Math.max(1, parseInt(saved, 10)) : 25;
  });

  const [breakMinutes, setBreakMinutes] = useState<number>(() => {
    const saved = localStorage.getItem('pomodoro_break_duration');
    return saved ? Math.max(1, parseInt(saved, 10)) : 5;
  });

  // Timer state
  const [mode, setMode] = useState<'work' | 'break'>('work');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(() => workMinutes * 60);

  // Completed pomodoros count
  const [completedSessions, setCompletedSessions] = useState<number>(() => {
    const saved = localStorage.getItem('pomodoro_completed_sessions');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Daily productivity stats (date string -> count)
  const [dailyStats, setDailyStats] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pomodoro_daily_stats');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
      return getSampleWeeklyStats();
    }
    return {};
  });

  // Save daily stats to local storage
  useEffect(() => {
    localStorage.setItem('pomodoro_daily_stats', JSON.stringify(dailyStats));
  }, [dailyStats]);

  // Cloudflare Sync state
  const [syncKey, setSyncKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const searchParams = new URLSearchParams(window.location.search);
      const urlKey = hashParams.get('sync') || searchParams.get('sync');
      if (urlKey && isValidSyncKey(urlKey)) {
        const normalizedKey = normalizeSyncKey(urlKey);
        localStorage.setItem('pomodoro_sync_key', normalizedKey);

        hashParams.delete('sync');
        searchParams.delete('sync');
        const cleanSearch = searchParams.toString();
        const cleanHash = hashParams.toString();
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${cleanHash ? `#${cleanHash}` : ''}`
        );
        return normalizedKey;
      }
      const storedKey = localStorage.getItem('pomodoro_sync_key') || '';
      return isValidSyncKey(storedKey) ? normalizeSyncKey(storedKey) : '';
    }
    return '';
  });

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('pomodoro_tasks');
    if (saved) {
      try {
        return normalizeTasks(JSON.parse(saved));
      } catch {
        return [];
      }
    }
    return [];
  });
  const tasksRef = useRef(tasks);

  // Save tasks to local storage
  useEffect(() => {
    tasksRef.current = tasks;
    localStorage.setItem('pomodoro_tasks', JSON.stringify(tasks));
  }, [tasks]);

  // Push tasks to Cloudflare / Server
  const syncRevisionRef = useRef(0);

  const pushTasksToServer = useCallback(async (key: string, tasksToPush: Task[]) => {
    const normalizedKey = normalizeSyncKey(key);
    if (!normalizedKey || !isValidSyncKey(normalizedKey)) return;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const postTasks = (tasksForRequest: Task[], baseRevision: number) => fetch('/api/tasks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${normalizedKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tasks: tasksForRequest, baseRevision }),
      });
      let tasksForRequest = tasksToPush;
      let res = await postTasks(tasksForRequest, syncRevisionRef.current);

      if (res.status === 409) {
        const conflict = await res.json();
        const remoteTasks = normalizeTasks(conflict.tasks);
        tasksForRequest = mergeTasks(tasksForRequest, remoteTasks);
        syncRevisionRef.current = Number.isInteger(conflict.revision) ? conflict.revision : 0;
        setTasks(tasksForRequest);
        res = await postTasks(tasksForRequest, syncRevisionRef.current);
      }

      if (res.ok) {
        const data = await res.json();
        syncRevisionRef.current = Number.isInteger(data.revision)
          ? data.revision
          : syncRevisionRef.current;
        setSyncStatus('synced');
        setLastSynced(Date.now());
        setSyncError(null);
      } else {
        const data = await res.json().catch(() => null);
        setSyncStatus('error');
        setSyncError(data?.error || 'Failed to push tasks');
      }
    } catch {
      setSyncStatus('error');
      setSyncError('Network error connecting to Cloudflare sync');
    }
  }, []);

  // Fetch tasks from Cloudflare / Server
  const fetchTasksFromServer = useCallback(async (key: string) => {
    const normalizedKey = normalizeSyncKey(key);
    if (!normalizedKey || !isValidSyncKey(normalizedKey)) return;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const res = await fetch('/api/tasks', {
        headers: { Authorization: `Bearer ${normalizedKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        const remoteTasks = normalizeTasks(data.tasks);
        syncRevisionRef.current = Number.isInteger(data.revision) ? data.revision : 0;

        const merged = mergeTasks(tasksRef.current, remoteTasks);
        setTasks(merged);
        if (JSON.stringify(merged) !== JSON.stringify(remoteTasks)) {
          await pushTasksToServer(normalizedKey, merged);
        }

        if (JSON.stringify(merged) === JSON.stringify(remoteTasks)) {
          setSyncStatus('synced');
          setLastSynced(Date.now());
          setSyncError(null);
        }
      } else {
        const data = await res.json().catch(() => null);
        setSyncStatus('error');
        setSyncError(data?.error || 'Could not retrieve remote tasks');
      }
    } catch {
      setSyncStatus('error');
      setSyncError('Network error retrieving tasks');
    }
  }, [pushTasksToServer]);

  // Initial fetch and key changes
  useEffect(() => {
    if (syncKey) {
      localStorage.setItem('pomodoro_sync_key', syncKey);
      fetchTasksFromServer(syncKey);
    }
  }, [syncKey, fetchTasksFromServer]);

  // Auto-sync on window focus
  useEffect(() => {
    const handleFocus = () => {
      if (syncKey) {
        fetchTasksFromServer(syncKey);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [syncKey, fetchTasksFromServer]);

  // Handle changing sync key
  const handleSetSyncKey = (newKey: string) => {
    const normalizedKey = normalizeSyncKey(newKey);
    setSyncKey(normalizedKey);
    localStorage.setItem('pomodoro_sync_key', normalizedKey);
  };

  const handleDisconnectSync = () => {
    setSyncKey('');
    localStorage.removeItem('pomodoro_sync_key');
    setSyncStatus('idle');
    setLastSynced(null);
  };

  // Save durations
  useEffect(() => {
    localStorage.setItem('pomodoro_work_duration', workMinutes.toString());
  }, [workMinutes]);

  useEffect(() => {
    localStorage.setItem('pomodoro_break_duration', breakMinutes.toString());
  }, [breakMinutes]);

  useEffect(() => {
    localStorage.setItem('pomodoro_completed_sessions', completedSessions.toString());
  }, [completedSessions]);

  // Keep timeLeft in sync when durations change while paused
  const handleWorkDurationChange = (val: number) => {
    if (isRunning) return;
    setWorkMinutes(val);
    if (mode === 'work') {
      setTimeLeft(val * 60);
    }
  };

  const handleBreakDurationChange = (val: number) => {
    if (isRunning) return;
    setBreakMinutes(val);
    if (mode === 'break') {
      setTimeLeft(val * 60);
    }
  };

  // Timer Tick Interval
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            // Session complete
            if (mode === 'work') {
              playWorkCompleteChime();
              setCompletedSessions((c) => c + 1);
              setDailyStats((s) => recordPomodoroCompletion(s));
              setMode('break');
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Pomodoro Complete!', {
                  body: `Great job! Time for a ${breakMinutes} minute break.`,
                });
              }
              return breakMinutes * 60;
            } else {
              playBreakCompleteChime();
              setMode('work');
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Break Finished!', {
                  body: `Time to start your ${workMinutes} minute work session.`,
                });
              }
              return workMinutes * 60;
            }
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, mode, workMinutes, breakMinutes]);

  // Toggle Start / Pause
  const toggleTimer = () => {
    playClickSound();
    if (!isRunning && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    setIsRunning(!isRunning);
  };

  // Reset Timer
  const resetTimer = () => {
    playClickSound();
    setIsRunning(false);
    setTimeLeft(mode === 'work' ? workMinutes * 60 : breakMinutes * 60);
  };

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        toggleTimer();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetTimer();
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setIsDark((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, mode, workMinutes, breakMinutes]);

  // Task actions with automatic Cloudflare sync
  const handleAddTask = (title: string) => {
    playClickSound();
    const newTask = createTask(title);
    setTasks((prev) => {
      const updated = [newTask, ...prev];
      if (syncKey) pushTasksToServer(syncKey, updated);
      return updated;
    });
  };

  const handleToggleTask = (id: string) => {
    playClickSound();
    setTasks((prev) => {
      const updated = toggleTask(prev, id);
      if (syncKey) pushTasksToServer(syncKey, updated);
      return updated;
    });
  };

  const handleUpdateTask = (id: string, newTitle: string) => {
    playClickSound();
    setTasks((prev) => {
      const updated = updateTaskTitle(prev, id, newTitle);
      if (syncKey) pushTasksToServer(syncKey, updated);
      return updated;
    });
  };

  const handleDeleteTask = (id: string) => {
    playClickSound();
    setTasks((prev) => {
      const updated = deleteTask(prev, id);
      if (syncKey) pushTasksToServer(syncKey, updated);
      return updated;
    });
  };

  const totalDuration = (mode === 'work' ? workMinutes : breakMinutes) * 60;

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-start py-4 sm:py-6 px-3 sm:px-6 transition-colors duration-200">
      {/* Centered Main Box matching pomoflow */}
      <main className="w-full max-w-3xl bg-[#cfcfcf] dark:bg-[#222222] border-2 border-neutral-400 dark:border-neutral-700 shadow-[6px_6px_0px_rgba(0,0,0,0.25)] dark:shadow-[6px_6px_0px_rgba(0,0,0,0.7)] p-4 sm:p-6 flex flex-col">
        {/* Header with Navigation Tabs */}
        <Header
          isDark={isDark}
          onToggleTheme={() => setIsDark(!isDark)}
          activeTab={activeTab}
          onChangeTab={setActiveTab}
        />

        {/* Tab 1: Timer & Tasks (Original Core Flow) */}
        {activeTab === 'timer' && (
          <>
            <TimerCircle
              mode={mode}
              timeLeft={timeLeft}
              totalDuration={totalDuration}
              isRunning={isRunning}
              workMinutes={workMinutes}
              breakMinutes={breakMinutes}
              onToggleStart={toggleTimer}
              onReset={resetTimer}
              onChangeWorkMinutes={handleWorkDurationChange}
              onChangeBreakMinutes={handleBreakDurationChange}
            />

            <TaskList
              tasks={tasks}
              onAddTask={handleAddTask}
              onToggleTask={handleToggleTask}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
              syncKey={syncKey}
              syncStatus={syncStatus}
              onOpenSyncModal={() => setIsSyncModalOpen(true)}
            />
          </>
        )}

        {/* Tab 2: Weekly Focus Analytics & Productivity Bar Chart */}
        {activeTab === 'stats' && (
          <div className="my-2">
            <WeeklyStats
              stats={dailyStats}
              workMinutes={workMinutes}
              isDark={isDark}
              onUpdateStats={setDailyStats}
            />
          </div>
        )}

        {/* Ambient & YouTube Audio Player Bar (Persistent across both tabs!) */}
        <AudioPlayer />
      </main>

      {/* Cloudflare Sync Modal */}
      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        syncKey={syncKey}
        syncStatus={syncStatus}
        syncError={syncError}
        lastSynced={lastSynced}
        onSetSyncKey={handleSetSyncKey}
        onDisconnect={handleDisconnectSync}
        onManualSync={() => syncKey && fetchTasksFromServer(syncKey)}
      />

      {/* Footer shortcut hints */}
      <footer className="mt-4 text-center font-pixel text-neutral-500 dark:text-neutral-400 text-sm sm:text-base tracking-wider select-none">
        <span>[Space] Start / Pause</span> &bull; <span>[R] Reset</span> &bull; <span>[D] Theme</span> &bull; <span>Total Sessions: {completedSessions}</span>
      </footer>
    </div>
  );
}
