'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'

export default function MySchedule() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(getMonday(new Date()))
  const router = useRouter()
  const supabase = createClient()

  function getMonday(date) {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    return d.toISOString().split('T')[0]
  }

  function getWeekDays(mondayStr) {
    const days = []
    const monday = new Date(mondayStr)
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      days.push(d.toISOString().split('T')[0])
    }
    return days
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'short'
    })
  }

  function formatTime(timeStr) {
    if (!timeStr) return ''
    const [h, m] = timeStr.split(':')
    const hour = parseInt(h)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${m} ${ampm}`
  }

  function calcHours(start, end) {
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const diff = (eh * 60 + em) - (sh * 60 + sm)
    return (diff / 60).toFixed(1)
  }

  function goToPrevWeek() {
    const d = new Date(selectedWeek)
    d.setDate(d.getDate() - 7)
    setSelectedWeek(d.toISOString().split('T')[0])
  }

  function goToNextWeek() {
    const d = new Date(selectedWeek)
    d.setDate(d.getDate() + 7)
    setSelectedWeek(d.toISOString().split('T')[0])
  }

  useEffect(() => {
    loadSchedule()
  }, [selectedWeek])

  async function loadSchedule() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const weekDays = getWeekDays(selectedWeek)
    const { data } = await supabase
      .from('schedules')
      .select('*')
      .eq('staff_id', user.id)
      .gte('shift_date', weekDays[0])
      .lte('shift_date', weekDays[6])
      .order('shift_date')

    setSchedules(data || [])
    setLoading(false)
  }

  const weekDays = getWeekDays(selectedWeek)
  const totalHours = schedules.reduce((sum, s) => sum + parseFloat(calcHours(s.start_time, s.end_time)), 0)

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center dark:bg-gray-800">
      <p className="text-gray-500 dark:text-white">Loading your schedule...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Nav */}
      <NavBar
        title="📅 My Schedule"
        backPath="/dashboard"
        backLabel="Dashboard"
      />

      <div className="max-w-lg mx-auto px-4 py-6 ">

        {/* Week navigator */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 flex items-center justify-between dark:bg-gray-700 dark:hover:bg-gray-600 transition">
          <button onClick={goToPrevWeek} className="bg-gray-100 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500
           hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg text-sm font-medium transition">
            ← Prev
          </button>
          <div className="text-center">
            <p className="font-semibold text-gray-800 text-sm dark:text-white">
              {formatDate(weekDays[0]).split(',')[0]} – {formatDate(weekDays[6]).split(',')[0]}
            </p>
            <p className="text-gray-400 text-xs dark:text-gray-400">{schedules.length} shifts · {totalHours.toFixed(1)} hrs</p>
          </div>
          <button onClick={goToNextWeek} className="bg-gray-100 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500
           hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition">
            Next →
          </button>
        </div>

        {/* Schedule list */}
        <div className="space-y-3">
          {weekDays.map(day => {
            const dayShifts = schedules.filter(s => s.shift_date === day)
            const isToday = day === new Date().toISOString().split('T')[0]

            return (
              <div
                key={day}
                className={`bg-white dark:bg-gray-600 rounded-2xl shadow-sm overflow-hidden ${isToday ? 'ring-2 ring-blue-500' : ''}`}
              >
                <div className={`px-4 py-3 ${isToday ? 'bg-blue-50 dark:bg-blue-900' : 'bg-gray-50 dark:bg-gray-700'}`}>
                 <span className={`font-semibold text-sm ${isToday ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'}`}>
                    {formatDate(day)}
                 </span>
                  {isToday && (
                    <span className="ml-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">Today</span>
                  )}
                </div>

                <div className="px-4 py-3">
                  {dayShifts.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-1 dark:text-white">Day off</p>
                  ) : (
                    dayShifts.map(shift => (
                      <div key={shift.id} className="flex items-center justify-between ">
                        <div>
                          <p className="font-medium text-gray-800 text-sm">
                            {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                          </p>
                          <p className="text-gray-500 text-xs">
                            {calcHours(shift.start_time, shift.end_time)} hours
                            {shift.position && ` · ${shift.position}`}
                          </p>
                          {shift.notes && (
                            <p className="text-gray-400 text-xs mt-0.5">{shift.notes}</p>
                          )}
                        </div>
                        <div className="bg-blue-100 text-blue-700 text-xs font-medium px-3 py-1 rounded-full">
                          {shift.branch}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}