// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

export default function ReportsPage() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  )
  const [emailTo, setEmailTo] = useState('')
  const [success, setSuccess] = useState('')
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  const [excelData, setExcelData] = useState(null)
  const router = useRouter()
  const supabase = createClient()
  const [fileName, setFileName] = useState('staff-report')
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('all')

  useEffect(() => {
    loadProfile()
  }, [selectedMonth, profile, selectedBranch])

  useEffect(() => {
    if (profile) loadPreview()
  }, [selectedMonth, profile])

  async function loadProfile() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: branchData } = await supabase
          .from('branches')
          .select('*')
          .order('name')

    setBranches(branchData || [])

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
    setEmailTo(profileData.email || '')
    setLoading(false)
  }

  async function loadPreview() {
    const [year, month] = selectedMonth.split('-')
    const startDate = `${year}-${month}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${month}-${lastDay}`

    let query = supabase
      .from('time_records')
      .select('*, staff:profiles!time_records_staff_id_fkey(full_name, hourly_rate, branch_id, branch:branches(name))')
      .gte('clock_in', startDate)
      .lte('clock_in', endDate + 'T23:59:59')
      .not('clock_out', 'is', null)

    if (selectedBranch !== 'all') {
      query = query.eq('staff.branch_id', selectedBranch)
    }

    const { data } = await query
    if (!data) return

    const summaryMap = {}
    data.forEach(function(r) {
      // Filter by branch if selected
      if (selectedBranch !== 'all' && r.staff?.branch_id !== selectedBranch) return

      const name = r.staff?.full_name || 'Unknown'
      const branch = r.staff?.branch?.name || 'Main'
      const hourlyRate = r.staff?.hourly_rate || 0
      if (!summaryMap[name]) {
        summaryMap[name] = { name, branch, totalMinutes: 0, shifts: 0, hourlyRate }
      }
      summaryMap[name].totalMinutes += r.total_minutes || 0
      summaryMap[name].shifts += 1
    })

    setPreview(Object.values(summaryMap))
  }

  async function handleSendReport() {
    if (!emailTo) {
      setError('Please enter an email address')
      return
    }
    body: JSON.stringify({ month: selectedMonth, email: emailTo, fileName: fileName || 'staff-report',branchId: selectedBranch })
    setSending(true)
    setError('')
    setSuccess('')
    setWarning('')

    const response = await fetch('/api/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: selectedMonth, email: emailTo })
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Failed to generate report')
      setSending(false)
      return
    }

    if (result.excel) {
      setExcelData(result.excel)
    }

    if (result.warning) {
      setWarning(result.warning)
    } else if (result.success) {
      setSuccess('Report sent to ' + emailTo + ' successfully!')
      setTimeout(() => setSuccess(''), 5000)
    }

    setSending(false)
  }

  async function handleDownload() {
  body: JSON.stringify({ month: selectedMonth, fileName: fileName || 'staff-report',branchId: selectedBranch })  
  setDownloading(true)
  setError('')

  const response = await fetch('/api/download-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: selectedMonth })
  })

  const result = await response.json()
  setDownloading(false)

  if (!response.ok) {
    setError(result.error || 'Failed to generate report')
    return
  }

  if (result.excel) {
    downloadExcel(result.excel)
  }
}

   function downloadExcel(base64Data) {
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (fileName || 'staff-report') + '-' + selectedMonth + '.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  function formatHours(minutes) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h + 'h ' + m + 'm'
  }

  function getMonthLabel() {
    const [year, month] = selectedMonth.split('-')
    return new Date(year, month - 1).toLocaleString('en-GB', {
      month: 'long', year: 'numeric'
    })
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm px-4 py-4 flex justify-between items-center">
        <button onClick={() => router.push('/dashboard')} className="text-blue-500 text-sm font-medium">
          ← Dashboard
        </button>
        <h1 className="text-lg font-bold text-gray-800">📊 Monthly Report</h1>
        <div className="w-16" />
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {success && (
          <div className="bg-green-50 text-green-700 rounded-xl px-4 py-3 text-sm font-medium">
            ✅ {success}
          </div>
        )}
        {warning && (
          <div className="bg-yellow-50 text-yellow-700 rounded-xl px-4 py-3 text-sm">
            ⚠️ {warning}
            {excelData && (
              <button
                onClick={() => downloadExcel(excelData)}
                className="block mt-2 text-blue-600 font-medium underline text-xs"
              >
                Download Excel file instead →
              </button>
            )}
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-red-600 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Month selector */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-700 text-sm mb-3">Select Month</h3>
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Branch filter */}
        {branches.length > 1 && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h3 className="font-semibold text-gray-700 text-sm mb-3">Filter by Branch</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedBranch('all')}
                className={
                  'px-4 py-2 rounded-lg text-xs font-medium border transition ' +
                  (selectedBranch === 'all'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400')
                }
              >
                All Branches
              </button>
              {branches.map(function(b) {
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBranch(b.id)}
                    className={
                      'px-4 py-2 rounded-lg text-xs font-medium border transition ' +
                      (selectedBranch === b.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400')
                    }
                  >
                    {b.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {/* Preview */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700 text-sm">
              Preview — {getMonthLabel()}
            </h3>
          </div>

          {preview.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-gray-400 text-sm">No time records found for this month</p>
            </div>
          ) : (
            <div>
              {/* Totals bar */}
              <div className="px-5 py-3 bg-blue-50 flex justify-between text-xs text-blue-700 font-medium">
                <span>{preview.length} staff members</span>
                <span>
                  Total: {formatHours(preview.reduce(function(sum, s) { return sum + s.totalMinutes }, 0))}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {preview.map(function(s) {
                  const hours = s.totalMinutes / 60
                  const pay = hours * s.hourlyRate
                  return (
                    <div key={s.name} className="px-5 py-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-800 text-sm">{s.name}</p>
                          <p className="text-gray-400 text-xs">{s.branch} · {s.shifts} shifts</p>
                        </div>
                        <div className="text-right">
                          <p className="text-blue-700 text-sm font-semibold">
                            {formatHours(s.totalMinutes)}
                          </p>
                          {s.hourlyRate > 0 && (
                            <p className="text-green-600 text-xs font-medium">
                              € {pay.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Grand total */}
              {preview.length > 0 && (
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                  <span className="text-gray-600 text-sm font-semibold">Grand Total</span>
                  <div className="text-right">
                    <p className="text-blue-700 text-sm font-semibold">
                      {formatHours(preview.reduce(function(sum, s) { return sum + s.totalMinutes }, 0))}
                    </p>
                    <p className="text-green-600 text-xs font-medium">
                      € {preview.reduce(function(sum, s) {
                        return sum + (s.totalMinutes / 60) * s.hourlyRate
                      }, 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Email & send */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-gray-700 text-sm">Send Report</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                File Name
            </label>
            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                <input
                type="text"
                value={fileName}
                onChange={e => setFileName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, ''))}
                className="flex-1 px-4 py-3 text-sm focus:outline-none"
                placeholder="staff-report"
                />
                <span className="bg-gray-50 text-gray-400 text-sm px-3 py-3 border-l border-gray-300">
                .xlsx
                </span>
            </div>
            <p className="text-gray-400 text-xs mt-1">
                Only letters, numbers, hyphens and underscores allowed
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Send to email
            </label>
            <input
              type="email"
              value={emailTo}
              onChange={e => setEmailTo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="manager@restaurant.com"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-200 transition disabled:opacity-50 text-sm"
            >
              {downloading ? 'Downloading...' : '⬇️ Download Excel'}
            </button>
            <button
              onClick={handleSendReport}
              disabled={sending || preview.length === 0}
              className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition disabled:opacity-50 text-sm"
            >
              {sending ? 'Sending...' : '📧 Send Report'}
            </button>
          </div>

          <p className="text-gray-400 text-xs text-center">
            Report includes 2 sheets: Summary and Detailed Records
          </p>
        </div>

      </div>
    </div>
  )
}