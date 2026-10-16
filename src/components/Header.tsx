import { Sun, Moon, Monitor } from 'lucide-react';
import type { ThemeMode } from '../utils/theme';

interface HeaderProps {
  isDark: boolean;
  themeMode: ThemeMode;
  onCycleTheme: () => void;
  activeTab: 'timer' | 'stats';
  onChangeTab: (tab: 'timer' | 'stats') => void;
}

/** A tiny one-bit tomato, drawn on an 8x8 grid. */
function TomatoMark() {
  return (
    <svg viewBox="0 0 8 8" width="16" height="16" aria-hidden="true" shapeRendering="crispEdges" fill="currentColor">
      <rect x="3" y="0" width="2" height="1" />
      <rect x="2" y="1" width="1" height="1" />
      <rect x="5" y="1" width="1" height="1" />
      <rect x="1" y="2" width="6" height="1" />
      <rect x="0" y="3" width="8" height="3" />
      <rect x="1" y="6" width="6" height="1" />
      <rect x="2" y="7" width="4" height="1" />
    </svg>
  );
}

const themeLabel: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function Header({ isDark, themeMode, onCycleTheme, activeTab, onChangeTab }: HeaderProps) {
  const nextMode = themeMode === 'system' ? 'light' : themeMode === 'light' ? 'dark' : 'system';
  const ThemeIcon = themeMode === 'system' ? Monitor : isDark ? Moon : Sun;

  return (
    <header className="menubar w-full flex items-center">
      <div className="menubar-item menubar-brand cursor-default pointer-events-none" aria-hidden="true">
        <TomatoMark />
        <span>Pomoflow</span>
      </div>

      <nav className="flex items-center" aria-label="View">
        <button
          type="button"
          className="menubar-item"
          onClick={() => onChangeTab('timer')}
          aria-selected={activeTab === 'timer'}
        >
          Timer
        </button>
        <button
          type="button"
          className="menubar-item"
          onClick={() => onChangeTab('stats')}
          aria-selected={activeTab === 'stats'}
        >
          Stats
        </button>
      </nav>

      <button
        type="button"
        onClick={onCycleTheme}
        aria-label={`Theme: ${themeMode}. Switch to ${nextMode} mode`}
        title={`Theme: ${themeMode}`}
        className="menubar-item ml-auto"
      >
        <ThemeIcon className="w-4 h-4" strokeWidth={2.5} />
        <span className="hidden sm:inline">{themeLabel[themeMode]}</span>
      </button>
    </header>
  );
}
