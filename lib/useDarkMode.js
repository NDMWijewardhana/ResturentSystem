import { useState, useEffect } from 'react'

export function useDarkMode() {
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    // Check saved preference first
    const saved = localStorage.getItem('darkMode')
    if (saved !== null) {
      const isDark = saved === 'true'
      setDarkMode(isDark)
      applyDarkMode(isDark)
    } else {
      // Fall back to system preference
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setDarkMode(systemDark)
      applyDarkMode(systemDark)
    }
  }, [])

  function applyDarkMode(isDark) {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  function toggleDarkMode() {
    const newValue = !darkMode
    setDarkMode(newValue)
    applyDarkMode(newValue)
    localStorage.setItem('darkMode', String(newValue))
  }

  return { darkMode, toggleDarkMode }
}