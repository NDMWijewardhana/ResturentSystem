'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'

export default function TimeRecordsManager() {
  const [records, setRecords] = useState([])
  const [staffList, setStaffList] = useState([])
  const [selectedStaff, setSelectedStaff] = useState('all')
  const [loading, setLoading] = useState(true)
  const [editingRecord, setEditingRecord] = useState(null)
  const [saving, setSaving] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  )
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [selectedMonth, selectedStaff])

  async function loadData() {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/')
      return
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profileData || profileData.role !== 'branch_manager') {
      router.push('/dashboard')
      return
    }

    const { data: staff } = await supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name')

    setStaffList(staff || [])

    const [year, month] = selectedMonth.split('-')
    const startDate = `${year}-${month}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${month}-${lastDay}`

    let query = supabase
      .from('time_records')
      .select('*, staff:profiles!time_records_staff_id_fkey(full_name)')
      .gte('clock_in', startDate)
      .lte('clock_in', endDate + 'T23:59:59')
      .order('clock_in', { ascending: false })

    if (selectedStaff !== 'all') {
      query = query.eq('staff_id', selectedStaff)
    }

    const { data } = await query
    setRecords(data || [])
    setLoading(false)
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return '-'
    return new Date(isoStr).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function formatDuration(minutes) {
    if (!minutes) return '-'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h + 'h ' + m + 'm'
  }

  function getTotalByStaff() {
    const totals = {}
    records.forEach(function(r) {
      const name = r.staff ? r.staff.full_name : 'Unknown'
      totals[name] = (totals[name] || 0) + (r.total_minutes || 0)
    })
    return Object.entries(totals).sort(function(a, b) {
      return b[1] - a[1]
    })
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    setSaving(true)

    const clockIn = new Date(editingRecord.clock_in)
    const clockOut = new Date(editingRecord.clock_out)
    const totalMinutes = Math.floor((clockOut - clockIn) / 60000)

    const { error } = await supabase
      .from('time_records')
      .update({
        clock_in: clockIn.toISOString(),
        clock_out: clockOut.toISOString(),
        total_minutes: totalMinutes,
        notes: editingRecord.notes
      })
      .eq('id', editingRecord.id)

    if (error) {
      alert('Error saving: ' + error.message)
    }

    setEditingRecord(null)
    setSaving(false)
    loadData()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this record?')) return
    await supabase.from('time_records').delete().eq('id', id)
    loadData()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center dark:bg-gray-800">
        <p className="text-gray-500 dark:text-white">Loading records...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800">

      {/* Nav */}
     <NavBar
        title="⏱️ Time Records"
        backPath="/dashboard"
        backLabel="Dashboard"
      />

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row gap-3 dark:bg-gray-700">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-white">
              Month
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-white">
              Staff Member
            </label>
            <select
              value={selectedStaff}
              onChange={e => setSelectedStaff(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Staff</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Monthly summary */}
        {getTotalByStaff().length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4 dark:bg-gray-600">
            <h3 className="font-semibold text-gray-700 text-sm mb-3 dark:text-white">
              Monthly Summary
            </h3>
            <div className="space-y-2">
              {getTotalByStaff().map(function(item) {
                return (
                  <div key={item[0]} className="flex justify-between items-center">
                    <span className="text-gray-700 text-sm dark:text-amber-50">{item[0]}</span>
                    <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full dark:bg-blue-500 dark:text-white">
                      {formatDuration(item[1])}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Records list */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden dark:bg-gray-600">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700 text-sm dark:text-white">
              All Records ({records.length})
            </h3>
          </div>

          {records.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-gray-400 text-sm dark:text-white">
                No records found for this period
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {records.map(function(record) {
                return (
                  <div key={record.id} className="px-4 py-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-gray-800 text-sm font-medium dark:text-amber-50">
                          {record.staff ? record.staff.full_name : 'Unknown'}
                        </p>
                        <p className="text-gray-500 text-xs dark:text-gray-300">
                          In: {formatDateTime(record.clock_in)}
                        </p>
                        <p className="text-gray-500 text-xs dark:text-gray-200">
                          Out: {formatDateTime(record.clock_out)}
                        </p>
                        {record.notes && (
                          <p className="text-gray-400 text-xs mt-0.5 dark:text-gray-300">
                            {record.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full dark:bg-blue-500 dark:text-white">
                          {formatDuration(record.total_minutes)}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingRecord({
                              ...record,
                              clock_in: new Date(record.clock_in)
                                .toISOString().slice(0, 16),
                              clock_out: record.clock_out
                                ? new Date(record.clock_out)
                                    .toISOString().slice(0, 16)
                                : ''
                            })}
                            className="text-blue-500 text-xs hover:text-blue-700 dark:text-gray-300 dark:hover:text-white"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(record.id)}
                            className="text-red-400 text-xs hover:text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 px-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-800">Edit Record</h2>
              <button
                onClick={() => setEditingRecord(null)}
                className="text-gray-400 text-xl"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Clock In
                </label>
                <input
                  type="datetime-local"
                  value={editingRecord.clock_in}
                  onChange={e => setEditingRecord({
                    ...editingRecord,
                    clock_in: e.target.value
                  })}
                  required
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Clock Out
                </label>
                <input
                  type="datetime-local"
                  value={editingRecord.clock_out}
                  onChange={e => setEditingRecord({
                    ...editingRecord,
                    clock_out: e.target.value
                  })}
                  required
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={editingRecord.notes || ''}
                  onChange={e => setEditingRecord({
                    ...editingRecord,
                    notes: e.target.value
                  })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional notes"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}