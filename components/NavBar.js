// @ts-nocheck
'use client'
import { useRouter } from 'next/navigation'
import { useDarkMode } from '@/lib/useDarkMode'

export default function NavBar({ title, backPath, backLabel, rightAction, rightLabel, rightStyle }) {
  const router = useRouter()
  const { darkMode, toggleDarkMode } = useDarkMode()

  return (
    <nav className="bg-white dark:bg-gray-900 shadow-sm px-4 py-4 flex justify-between items-center sticky top-0 z-40 border-b border-gray-100 dark:border-gray-800">
      {/* Left side */}
      <div className="flex-1">
        {backPath && (
          <button
            onClick={() => router.push(backPath)}
            className="text-blue-500 text-sm font-medium hover:text-blue-700"
          >
            ← {backLabel || 'Back'}
          </button>
        )}
      </div>

      {/* Title */}
      <h1 className="text-lg font-bold text-gray-800 dark:text-white">{title}</h1>

      {/* Right side */}
      <div className="flex-1 flex justify-end items-center gap-2">
        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition text-lg"
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>

        {/* Optional right action button */}
        {rightAction && (
          <button
            onClick={rightAction}
            className={rightStyle || 'bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition'}
          >
            {rightLabel}
          </button>
        )}
      </div>
    </nav>
  )
}