import { Sun, Moon, Monitor, Clock, BarChart3 } from 'lucide-react';
import type { ThemeMode } from '../utils/theme';

interface HeaderProps {
  isDark: boolean;
  themeMode: ThemeMode;
  onCycleTheme: () => void;
  activeTab: 'timer' | 'stats';
  onChangeTab: (tab: 'timer' | 'stats') => void;
}

export function Header({ isDark, themeMode, onCycleTheme, activeTab, onChangeTab }: HeaderProps) {
  const nextMode = themeMode === 'system' ? 'light' : themeMode === 'light' ? 'dark' : 'system';
  return (
    <header className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 sm:mb-6 pt-1">
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-widest text-neutral-900 dark:text-neutral-100 font-pixel uppercase select-none">
        Pomodoro Focus
      </h1>

      <div className="flex items-center gap-2">
        {/* Tab switcher with minimal disturbance */}
        <div className="flex border border-neutral-500 dark:border-neutral-500 bg-neutral-100/60 dark:bg-neutral-900/60 font-pixel shadow-[2px_2px_0px_rgba(0,0,0,0.15)]">
          <button
            type="button"
            onClick={() => onChangeTab('timer')}
            aria-selected={activeTab === 'timer'}
            className={`px-3 py-1 sm:py-1.5 text-base sm:text-lg uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'timer'
                ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 font-bold'
                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300/60 dark:hover:bg-neutral-800/60'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Timer</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeTab('stats')}
            aria-selected={activeTab === 'stats'}
            className={`px-3 py-1 sm:py-1.5 text-base sm:text-lg uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors ${
              activeTab === 'stats'
                ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900 font-bold'
                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300/60 dark:hover:bg-neutral-800/60'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Stats</span>
          </button>
        </div>

        {/* Theme button */}
        <button
          type="button"
          onClick={onCycleTheme}
          aria-label={`Theme: ${themeMode}. Switch to ${nextMode} mode`}
          title={`Theme: ${themeMode}`}
          className="p-1.5 sm:p-2 rounded-none border border-neutral-400 dark:border-neutral-600 bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700 active:translate-y-0.5 transition-colors cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,0.2)] dark:shadow-[2px_2px_0px_rgba(255,255,255,0.1)]"
        >
          {themeMode === 'system' ? (
            <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : isDark ? (
            <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : (
            <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </button>
      </div>
    </header>
  );
}
