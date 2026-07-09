// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'

export default function RequestsPage() {
  const [profile, setProfile] = useState(null)
  const [requests, setRequests] = useState([])
  const [schedules, setSchedules] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [requestType, setRequestType] = useState('leave')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    leave_start_date: '',
    leave_end_date: '',
    leave_type: 'annual',
    current_shift_id: '',
    requested_date: '',
    requested_start_time: '',
    requested_end_time: '',
    reason: ''
  })

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    setProfile(profileData)

    // Load own requests
    const { data: requestsData } = await supabase
      .from('requests')
      .select('*')
      .eq('staff_id', user.id)
      .order('created_at', { ascending: false })

    setRequests(requestsData || [])

    // Load own upcoming schedules for shift change
    const today = new Date().toISOString().split('T')[0]
    const { data: schedulesData } = await supabase
      .from('schedules')
      .select('*')
      .eq('staff_id', user.id)
      .gte('shift_date', today)
      .order('shift_date')

    setSchedules(schedulesData || [])
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      staff_id: profile.id,
      type: requestType,
      status: 'pending',
      reason: form.reason
    }

    if (requestType === 'leave') {
      if (form.leave_start_date > form.leave_end_date) {
        setError('End date must be after start date')
        setSaving(false)
        return
      }
      payload.leave_start_date = form.leave_start_date
      payload.leave_end_date = form.leave_end_date
      payload.leave_type = form.leave_type
    } else {
      payload.current_shift_id = form.current_shift_id
      payload.requested_date = form.requested_date
      payload.requested_start_time = form.requested_start_time
      payload.requested_end_time = form.requested_end_time
    }

    const { error: insertError } = await supabase
      .from('requests')
      .insert(payload)

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    // Send email notification to manager
    await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'manager@restaurant.com',
        subject: requestType === 'leave'
          ? 'New Leave Request from ' + profile.full_name
          : 'New Shift Change Request from ' + profile.full_name,
        html: `
          <h2>New ${requestType === 'leave' ? 'Leave' : 'Shift Change'} Request</h2>
          <p><strong>Staff:</strong> ${profile.full_name}</p>
          <p><strong>Type:</strong> ${requestType === 'leave' ? form.leave_type + ' leave' : 'Shift change'}</p>
          ${requestType === 'leave'
            ? `<p><strong>Dates:</strong> ${form.leave_start_date} to ${form.leave_end_date}</p>`
            : `<p><strong>Requested date:</strong> ${form.requested_date}</p>`
          }
          <p><strong>Reason:</strong> ${form.reason || 'Not provided'}</p>
          <p>Please log in to the system to approve or reject this request.</p>
        `
      })
    })

    setSuccess(requestType === 'leave' ? 'Leave request submitted!' : 'Shift change request submitted!')
    setShowForm(false)
    setTimeout(() => setSuccess(''), 3000)
    loadData()
    setSaving(false)
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric'
    })
  }

  function formatTime(timeStr) {
    if (!timeStr) return ''
    const [h, m] = timeStr.split(':')
    const hour = parseInt(h)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return displayHour + ':' + m + ' ' + ampm
  }

  function getStatusColor(status) {
    if (status === 'approved') return 'bg-green-50 text-green-700'
    if (status === 'rejected') return 'bg-red-50 text-red-700'
    return 'bg-yellow-50 text-yellow-700'
  }

  function getStatusLabel(status) {
    if (status === 'approved') return '✅ Approved'
    if (status === 'rejected') return '❌ Rejected'
    return '⏳ Pending'
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center dark:bg-gray-800">
      <p className="text-gray-500 dark:text-white">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <NavBar
        title="📋 My Requests"
        backPath="/dashboard"
        backLabel="Dashboard"
        rightAction={() => setShowForm(true)}
        rightLabel="+ New"
      />

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {success && (
          <div className="bg-green-50 text-green-700 rounded-xl px-4 py-3 text-sm font-medium">
            ✅ {success}
          </div>
        )}

        {/* Quick action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setRequestType('leave'); setShowForm(true) }}
            className="bg-white rounded-2xl shadow-sm p-4 text-left hover:shadow-md transition"
          >
            <p className="text-2xl mb-1">🏖️</p>
            <p className="font-semibold text-gray-800 text-sm">Apply Leave</p>
            <p className="text-gray-400 text-xs">Annual, sick, unpaid</p>
          </button>
          <button
            onClick={() => { setRequestType('shift_change'); setShowForm(true) }}
            className="bg-white rounded-2xl shadow-sm p-4 text-left hover:shadow-md transition"
          >
            <p className="text-2xl mb-1">🔄</p>
            <p className="font-semibold text-gray-800 text-sm">Shift Change</p>
            <p className="text-gray-400 text-xs">Request a shift swap</p>
          </button>
        </div>

        {/* Requests list */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700 text-sm">
              Request History ({requests.length})
            </h3>
          </div>

          {requests.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-gray-400 text-sm">No requests yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {requests.map(function(req) {
                return (
                  <div key={req.id} className="px-4 py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-medium text-gray-800 text-sm capitalize">
                          {req.type === 'leave' ? '🏖️ Leave' : '🔄 Shift Change'}
                        </span>
                        {req.leave_type && (
                          <span className="ml-2 text-gray-400 text-xs capitalize">
                            ({req.leave_type})
                          </span>
                        )}
                      </div>
                      <span className={'text-xs font-medium px-3 py-1 rounded-full ' + getStatusColor(req.status)}>
                        {getStatusLabel(req.status)}
                      </span>
                    </div>

                    {req.type === 'leave' && (
                      <p className="text-gray-500 text-xs">
                        {formatDate(req.leave_start_date)} – {formatDate(req.leave_end_date)}
                      </p>
                    )}
                    {req.type === 'shift_change' && (
                      <p className="text-gray-500 text-xs">
                        Requested: {formatDate(req.requested_date)}
                        {req.requested_start_time && ' · ' + formatTime(req.requested_start_time) + ' – ' + formatTime(req.requested_end_time)}
                      </p>
                    )}
                    {req.reason && (
                      <p className="text-gray-400 text-xs mt-1">Reason: {req.reason}</p>
                    )}
                    {req.manager_note && (
                      <div className="mt-2 bg-gray-50 rounded-lg px-3 py-2">
                        <p className="text-gray-500 text-xs">
                          Manager note: {req.manager_note}
                        </p>
                      </div>
                    )}
                    <p className="text-gray-300 text-xs mt-2">
                      Submitted {formatDate(req.created_at)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* New Request Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 px-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">New Request</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            {/* Type switcher */}
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => setRequestType('leave')}
                className={
                  'flex-1 py-2 rounded-lg text-sm font-medium border transition ' +
                  (requestType === 'leave'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300')
                }
              >
                🏖️ Leave
              </button>
              <button
                type="button"
                onClick={() => setRequestType('shift_change')}
                className={
                  'flex-1 py-2 rounded-lg text-sm font-medium border transition ' +
                  (requestType === 'shift_change'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300')
                }
              >
                🔄 Shift Change
              </button>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Leave fields */}
              {requestType === 'leave' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Leave Type
                    </label>
                    <select
                      value={form.leave_type}
                      onChange={e => setForm({ ...form, leave_type: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="annual">Annual Leave</option>
                      <option value="sick">Sick Leave</option>
                      <option value="unpaid">Unpaid Leave</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={form.leave_start_date}
                        onChange={e => setForm({ ...form, leave_start_date: e.target.value })}
                        required
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={form.leave_end_date}
                        onChange={e => setForm({ ...form, leave_end_date: e.target.value })}
                        required
                        min={form.leave_start_date || new Date().toISOString().split('T')[0]}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Shift change fields */}
              {requestType === 'shift_change' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Which shift do you want to change?
                    </label>
                    <select
                      value={form.current_shift_id}
                      onChange={e => setForm({ ...form, current_shift_id: e.target.value })}
                      required
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a shift...</option>
                      {schedules.map(function(s) {
                        return (
                          <option key={s.id} value={s.id}>
                            {formatDate(s.shift_date)} · {formatTime(s.start_time)} – {formatTime(s.end_time)}
                          </option>
                        )
                      })}
                    </select>
                    {schedules.length === 0 && (
                      <p className="text-gray-400 text-xs mt-1">
                        No upcoming shifts found
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Requested New Date
                    </label>
                    <input
                      type="date"
                      value={form.requested_date}
                      onChange={e => setForm({ ...form, requested_date: e.target.value })}
                      required
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        New Start Time
                      </label>
                      <input
                        type="time"
                        value={form.requested_start_time}
                        onChange={e => setForm({ ...form, requested_start_time: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        New End Time
                      </label>
                      <input
                        type="time"
                        value={form.requested_end_time}
                        onChange={e => setForm({ ...form, requested_end_time: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={form.reason}
                  onChange={e => setForm({ ...form, reason: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Explain your reason..."
                />
              </div>

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
                  {saving ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}