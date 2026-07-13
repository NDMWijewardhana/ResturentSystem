'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'

export default function SchedulesPage() {
  const [profile, setProfile] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [staffList, setStaffList] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(getMonday(new Date()))

  const [form, setForm] = useState({
    staff_id: '',
    shift_date: '',
    start_time: '',
    end_time: '',
    position: '',
    notes: ''
  })

  const router = useRouter()
  const supabase = createClient()

  // Get Monday of current week
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
      weekday: 'short', day: 'numeric', month: 'short'
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
    loadData()
  }, [selectedWeek])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profileData || profileData.role !== 'branch_manager') {
      router.push('/dashboard')
      return
    }

    setProfile(profileData)

    // Load staff list
    const { data: staff } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .order('full_name')

    setStaffList(staff || [])

    // Load schedules for selected week
    const weekDays = getWeekDays(selectedWeek)
    const { data: schedulesData } = await supabase
      .from('schedules')
      .select(`
        *,
        staff:profiles!schedules_staff_id_fkey(full_name, email)
      `)
      .gte('shift_date', weekDays[0])
      .lte('shift_date', weekDays[6])
      .order('shift_date')
      .order('start_time')

    setSchedules(schedulesData || [])
    setLoading(false)
  }

  function openAddForm(date = '') {
    setEditingSchedule(null)
    setForm({
      staff_id: '',
      shift_date: date,
      start_time: '',
      end_time: '',
      position: '',
      notes: ''
    })
    setShowForm(true)
    setError('')
  }

  function openEditForm(schedule) {
    setEditingSchedule(schedule)
    setForm({
      staff_id: schedule.staff_id,
      shift_date: schedule.shift_date,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      position: schedule.position || '',
      notes: schedule.notes || ''
    })
    setShowForm(true)
    setError('')
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (form.start_time >= form.end_time) {
      setError('End time must be after start time')
      setSaving(false)
      return
    }

    const payload = {
      staff_id: form.staff_id,
      shift_date: form.shift_date,
      start_time: form.start_time,
      end_time: form.end_time,
      position: form.position,
      notes: form.notes,
      branch: profile.branch || 'Main Branch',
      created_by: profile.id
    }

    let error
    if (editingSchedule) {
      ({ error } = await supabase
        .from('schedules')
        .update(payload)
        .eq('id', editingSchedule.id))
    } else {
      ({ error } = await supabase
        .from('schedules')
        .insert(payload))
    }

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setSuccess(editingSchedule ? 'Schedule updated!' : 'Schedule created!')
    setShowForm(false)
    setTimeout(() => setSuccess(''), 3000)
    loadData()
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this shift?')) return
    await supabase.from('schedules').delete().eq('id', id)
    loadData()
  }

  const weekDays = getWeekDays(selectedWeek)

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center dark:bg-gray-900">
      <p className="text-gray-500 dark:text-white">Loading schedules...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
      {/* Nav */}
      <NavBar
        title="📅 Work Schedules"
        backPath="/dashboard"
        backLabel="Dashboard"
        rightAction={() => openAddForm()}
        rightLabel="+ Add Shift"
      />

      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Success message */}
        {success && (
          <div className="bg-green-50 text-green-700 rounded-xl px-4 py-3 mb-4 text-sm font-medium">
            ✅ {success}
          </div>
        )}

        {/* Week navigator */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 flex items-center justify-between dark:bg-gray-700 ">
          <button
            onClick={goToPrevWeek}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition 
                       dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400"
          >
            ← Prev
          </button>
          <div className="text-center">
            <p className="font-semibold text-gray-800 text-sm dark:text-white">
              {formatDate(weekDays[0])} — {formatDate(weekDays[6])}
            </p>
            <p className="text-gray-400 text-xs mt-0.5 dark:text-amber-50">Week View</p>
          </div>
          <button
            onClick={goToNextWeek}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition
                       dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400"
          >
            Next →
          </button>
        </div>

        {/* Weekly schedule */}
        <div className="space-y-3">
          {weekDays.map(day => {
            const daySchedules = schedules.filter(s => s.shift_date === day)
            const isToday = day === new Date().toISOString().split('T')[0]

            return (
              <div
                key={day}
                className={`bg-white rounded-2xl shadow-sm overflow-hidden ${isToday ? 'ring-2 ring-blue-500' : ''}`}
              >
                {/* Day header */}
                <div className={`px-4 py-3 flex justify-between items-center ${isToday ? 'bg-blue-50 dark:bg-gray-700' : 'bg-gray-50 dark:bg-gray-700'}`}>
                  <div>
                    <span className={`font-semibold text-sm ${isToday ? 'text-blue-700 dark:text-white' : 'text-gray-700 dark:text-white'}`}>
                      {formatDate(day)}
                    </span>
                    {isToday && (
                      <span className="ml-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">Today</span>
                    )}
                  </div>
                  <button
                    onClick={() => openAddForm(day)}
                    className="text-blue-500 text-xs font-medium hover:text-blue-700"
                  >
                    + Add
                  </button>
                </div>

                {/* Shifts */}
                <div className="px-4 py-2 dark:bg-gray-600">
                  {daySchedules.length === 0 ? (
                    <p className="text-gray-400 text-sm py-2 text-center dark:text-white">No shifts scheduled</p>
                  ) : (
                    <div className="space-y-2 py-1">
                      {daySchedules.map(schedule => (
                        <div
                          key={schedule.id}
                          className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3 dark:bg-gray-600"
                        >
                          <div>
                            <p className="font-medium text-gray-800 text-sm dark:text-white">
                              {schedule.staff?.full_name}
                            </p>
                            <p className="text-gray-500 text-xs dark:text-amber-50">
                              {formatTime(schedule.start_time)} – {formatTime(schedule.end_time)}
                              {schedule.position && ` · ${schedule.position}`}
                            </p>
                            {schedule.notes && (
                              <p className="text-gray-400 text-xs mt-0.5">{schedule.notes}</p>
                            )}
                          </div>
                          <div className="flex gap-2 ml-4">
                            <button
                              onClick={() => openEditForm(schedule)}
                              className="text-blue-500 text-xs font-medium hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-500"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(schedule.id)}
                              className="text-red-400 text-xs font-medium hover:text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 px-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-800">
                {editingSchedule ? 'Edit Shift' : 'Add Shift'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              {/* Staff selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Staff Member
                </label>
                <select
                  value={form.staff_id}
                  onChange={e => setForm({ ...form, staff_id: e.target.value })}
                  required
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select staff member...</option>
                  {staffList.map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.full_name} ({staff.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Shift Date
                </label>
                <input
                  type="date"
                  value={form.shift_date}
                  onChange={e => setForm({ ...form, shift_date: e.target.value })}
                  required
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={e => setForm({ ...form, start_time: e.target.value })}
                    required
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={e => setForm({ ...form, end_time: e.target.value })}
                    required
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Position */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Position <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.position}
                  onChange={e => setForm({ ...form, position: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Cashier, Kitchen, Server"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Any notes for this shift..."
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingSchedule ? 'Update Shift' : 'Save Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}