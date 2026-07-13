// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'

export default function ApprovalsPage() {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState(null)
  const [managerNote, setManagerNote] = useState('')
  const [showNoteFor, setShowNoteFor] = useState(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [filter])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'branch_manager') {
      router.push('/dashboard')
      return
    }

    let query = supabase
      .from('requests')
      .select(`
        *,
        staff:profiles!requests_staff_id_fkey(full_name, email),
        shift:schedules!requests_current_shift_id_fkey(shift_date, start_time, end_time)
      `)
      .order('created_at', { ascending: false })

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data } = await query
    setRequests(data || [])
    setLoading(false)
  }

  async function handleAction(requestId, action, staffEmail, staffName, request) {
    setActioningId(requestId)

    const { error } = await supabase
      .from('requests')
      .update({
        status: action,
        manager_note: managerNote || null,
        actioned_at: new Date().toISOString()
      })
      .eq('id', requestId)

    if (error) {
      alert('Error: ' + error.message)
      setActioningId(null)
      return
    }

    // Send email to staff
    const isLeave = request.type === 'leave'
    const actionLabel = action === 'approved' ? 'Approved' : 'Rejected'

    await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: staffEmail,
        subject: `Your ${isLeave ? 'Leave' : 'Shift Change'} Request has been ${actionLabel}`,
        html: `
          <h2>Request ${actionLabel}</h2>
          <p>Hi ${staffName},</p>
          <p>Your ${isLeave ? 'leave' : 'shift change'} request has been <strong>${action}</strong>.</p>
          ${isLeave
            ? `<p><strong>Dates:</strong> ${request.leave_start_date} to ${request.leave_end_date}</p>`
            : `<p><strong>Requested date:</strong> ${request.requested_date}</p>`
          }
          ${managerNote ? `<p><strong>Manager note:</strong> ${managerNote}</p>` : ''}
          <p>Please log in to the system to view details.</p>
        `
      })
    })

    setManagerNote('')
    setShowNoteFor(null)
    setActioningId(null)
    loadData()
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

  const pendingCount = requests.filter(r => r.status === 'pending').length

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center dark:bg-gray-800">
      <p className="text-gray-500 dark:text-white">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">
     <NavBar
        title="✅ Approvals"
        backPath="/dashboard"
        backLabel="Dashboard"
      />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Filter tabs */}
        <div className="bg-white rounded-2xl shadow-sm p-2 flex gap-2 dark:bg-gray-700">
          {['pending', 'approved', 'rejected', 'all'].map(function(f) {
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  'flex-1 py-2 rounded-xl text-xs font-medium transition capitalize ' +
                  (filter === f
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-500 hover:bg-gray-50')
                }
              >
                {f}
                {f === 'pending' && pendingCount > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-xs px-1.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Requests */}
        {requests.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center dark:bg-gray-700">
            <p className="text-gray-400 text-sm dark:text-white">No {filter} requests</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(function(req) {
              return (
                <div key={req.id} className="bg-white rounded-2xl shadow-sm p-5 dark:bg-gray-700">

                  {/* Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold text-gray-800 dark:text-white">
                        {req.staff?.full_name}
                      </p>
                      <p className="text-gray-500 text-xs dark:text-gray-300">
                        {req.type === 'leave' ? '🏖️ Leave Request' : '🔄 Shift Change'}
                        {req.leave_type && ' · ' + req.leave_type}
                      </p>
                    </div>
                    <span className={'text-xs font-medium px-3 py-1 rounded-full ' + getStatusColor(req.status)}>
                      {req.status}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-1 dark:bg-gray-600">
                    {req.type === 'leave' && (
                      <>
                        <p className="text-gray-600 text-sm dark:text-white">
                          From: <strong>{formatDate(req.leave_start_date)}</strong>
                        </p>
                        <p className="text-gray-600 text-sm dark:text-gray-300">
                          To: <strong>{formatDate(req.leave_end_date)}</strong>
                        </p>
                      </>
                    )}
                    {req.type === 'shift_change' && (
                      <>
                        {req.shift && (
                          <p className="text-gray-600 text-sm dark:text-gray-300">
                            Current shift: <strong>
                              {formatDate(req.shift.shift_date)} · {formatTime(req.shift.start_time)} – {formatTime(req.shift.end_time)}
                            </strong>
                          </p>
                        )}
                        <p className="text-gray-600 text-sm">
                          Requested: <strong>{formatDate(req.requested_date)}</strong>
                          {req.requested_start_time && ' · ' + formatTime(req.requested_start_time) + ' – ' + formatTime(req.requested_end_time)}
                        </p>
                      </>
                    )}
                    {req.reason && (
                      <p className="text-gray-500 text-xs mt-1 dark:text-gray-200">
                        Reason: {req.reason}
                      </p>
                    )}
                  </div>

                  {req.manager_note && (
                    <div className="bg-blue-50 rounded-xl p-3 mb-3">
                      <p className="text-blue-700 text-xs">
                        Manager note: {req.manager_note}
                      </p>
                    </div>
                  )}

                  <p className="text-gray-300 text-xs mb-3">
                    Submitted {formatDate(req.created_at)}
                  </p>

                  {/* Action buttons — only for pending */}
                  {req.status === 'pending' && (
                    <div className="space-y-2">
                      {showNoteFor === req.id && (
                        <input
                          type="text"
                          value={managerNote}
                          onChange={e => setManagerNote(e.target.value)}
                          placeholder="Add a note (optional)"
                          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowNoteFor(showNoteFor === req.id ? null : req.id)}
                          className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition"
                        >
                          {showNoteFor === req.id ? 'Hide note' : '+ Note'}
                        </button>
                        <button
                          onClick={() => handleAction(req.id, 'rejected', req.staff?.email, req.staff?.full_name, req)}
                          disabled={actioningId === req.id}
                          className="flex-1 bg-red-50 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition disabled:opacity-50"
                        >
                          ❌ Reject
                        </button>
                        <button
                          onClick={() => handleAction(req.id, 'approved', req.staff?.email, req.staff?.full_name, req)}
                          disabled={actioningId === req.id}
                          className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
                        >
                          ✅ Approve
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}