/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { TimerCircle } from './components/TimerCircle';
import { TaskList } from './components/TaskList';
import { AudioPlayer } from './components/AudioPlayer';
import { SyncModal } from './components/SyncModal';
import { createTask, toggleTask, updateTaskTitle, deleteTask } from './utils/tasks';
import { playClickSound } from './utils/audio';
import { nextThemeMode, normalizeThemeMode, type ThemeMode } from './utils/theme';
import { usePomodoro } from './hooks/usePomodoro';
import { useTaskSync } from './hooks/useTaskSync';

const WeeklyStats = lazy(() => import('./components/WeeklyStats').then(module => ({ default: module.WeeklyStats })));

export default function App() {
  const [activeTab, setActiveTab] = useState<'timer' | 'stats'>('timer');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => normalizeThemeMode(localStorage.getItem('pomodoro_theme')));
  const [systemIsDark, setSystemIsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const isDark = themeMode === 'system' ? systemIsDark : themeMode === 'dark';
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const timer = usePomodoro();
  const sync = useTaskSync();
  const cycleTheme = useCallback(() => setThemeMode(current => nextThemeMode(current)), []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemIsDark(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('pomodoro_theme', themeMode);
    // The document's theme-color overrides the manifest fallback in installed
    // Chromium windows and follows the explicit in-app choice as well as system.
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.removeAttribute('media'); meta.content = isDark ? '#121212' : '#ffffff';
    }
  }, [isDark, themeMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat
        || event.isComposing || isSyncModalOpen || sync.pendingPairKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (event.code === 'Space') {
        // Let a focused button handle Space itself (including the timer button).
        if (target?.closest('button, a')) return;
        event.preventDefault(); timer.toggleTimer();
      } else if (event.key.toLowerCase() === 'r') { event.preventDefault(); timer.resetTimer(); }
      else if (event.key.toLowerCase() === 'd') { event.preventDefault(); cycleTheme(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [timer.toggleTimer, timer.resetTimer, cycleTheme, isSyncModalOpen, sync.pendingPairKey]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center">
      <Header isDark={isDark} themeMode={themeMode} onCycleTheme={cycleTheme} activeTab={activeTab} onChangeTab={setActiveTab} />
      <div className="w-full max-w-2xl flex flex-col px-3 sm:px-6 pt-6 sm:pt-10 pb-6">
        <main className="window w-full">
          <div className="titlebar">
            <span className="titlebar-box left" aria-hidden="true" />
            <h1 className="titlebar-title">{activeTab === 'timer' ? 'Timer' : 'Stats'}</h1>
            <span className="titlebar-box right" aria-hidden="true" />
          </div>
          <div className="window-body">
            {activeTab === 'timer' ? <>
              <TimerCircle mode={timer.mode} timeLeft={timer.timeLeft}
                totalDuration={(timer.mode === 'work' ? timer.workMinutes : timer.breakMinutes) * 60}
                isRunning={timer.isRunning} workMinutes={timer.workMinutes} breakMinutes={timer.breakMinutes}
                onToggleStart={timer.toggleTimer} onReset={timer.resetTimer}
                onChangeWorkMinutes={timer.handleWorkDurationChange} onChangeBreakMinutes={timer.handleBreakDurationChange} />
              <TaskList tasks={sync.tasks} syncKey={sync.syncKey} syncStatus={sync.syncStatus}
                onOpenSyncModal={() => setIsSyncModalOpen(true)}
                onAddTask={title => { playClickSound(); sync.updateTasks([createTask(title), ...sync.tasks]); }}
                onToggleTask={id => { playClickSound(); sync.updateTasks(toggleTask(sync.tasks, id)); }}
                onUpdateTask={(id, title) => { playClickSound(); sync.updateTasks(updateTaskTitle(sync.tasks, id, title)); }}
                onDeleteTask={id => { playClickSound(); sync.updateTasks(deleteTask(sync.tasks, id)); }} />
              {sync.syncError && <p role="alert" className="mt-2 text-base">{sync.syncError}</p>}
            </> : <Suspense fallback={<div className="min-h-80 flex items-center justify-center text-xl">Loading stats...</div>}>
              <WeeklyStats stats={timer.focusStats} isDark={isDark} onGoToTimer={() => setActiveTab('timer')} />
            </Suspense>}
          </div>
        </main>
        <AudioPlayer compact={activeTab === 'stats'} />
        <footer className="mt-5 flex justify-center">
          <p className="statusline select-none">
            <span className="hidden sm:inline">Space start/pause &nbsp; R reset &nbsp; D theme &nbsp;|&nbsp; </span>
            <span>{timer.completedSessions} {timer.completedSessions === 1 ? 'timer' : 'timers'} completed</span>
          </p>
        </footer>
      </div>
      <SyncModal isOpen={isSyncModalOpen && !sync.pendingPairKey} onClose={() => setIsSyncModalOpen(false)}
        syncKey={sync.syncKey} syncStatus={sync.syncStatus} syncError={sync.syncError} lastSynced={sync.lastSynced}
        onSetSyncKey={sync.requestPair} onRotateSyncKey={sync.rotateKey} onDisconnect={sync.disconnect}
        onManualSync={() => void sync.sync()} />
      {sync.pendingPairKey && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 [background:var(--screen)]"
        role="dialog" aria-modal="true" aria-labelledby="pair-title">
        <div className="dialog w-full max-w-lg p-5">
          <h2 id="pair-title" className="text-2xl font-bold">Pair with this task list?</h2>
          <code className="block break-all font-data my-2">{sync.pendingPairKey}</code>
          <p className="text-lg">This switches this device to the linked room. Choose whether to share your {sync.tasks.length} local tasks. A local backup is kept when switching.</p>
          <div className="flex flex-col gap-2 mt-4">
            <button className="btn btn-default" disabled={sync.pairingBusy} onClick={() => void sync.confirmPair(false)}>Use room tasks only</button>
            <button className="btn" disabled={sync.pairingBusy} onClick={() => void sync.confirmPair(true)}>Merge and share my tasks</button>
            <button className="btn" disabled={sync.pairingBusy} onClick={sync.cancelPair}>Cancel pairing</button>
          </div>
          {sync.pairingError && <p role="alert" className="mt-2">{sync.pairingError}</p>}
        </div>
      </div>}
    </div>
  );
}
