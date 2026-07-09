// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'

export default function Dashboard() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())

  // Manager dashboard data
  const [staffClockedIn, setStaffClockedIn] = useState([])
  const [pendingLeave, setPendingLeave] = useState(0)
  const [pendingShift, setPendingShift] = useState(0)
  const [pendingStock, setPendingStock] = useState(0)
  const [lowStockItems, setLowStockItems] = useState([])
  const [weeklyHours, setWeeklyHours] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [totalStaff, setTotalStaff] = useState(0)

  // Collapse states
  const [showStaffOnDuty, setShowStaffOnDuty] = useState(false)
  const [showPendingAlerts, setShowPendingAlerts] = useState(false)
  const [showWeeklyHours, setShowWeeklyHours] = useState(false)
  const [showLowStock, setShowLowStock] = useState(false)
  const [showRecentActivity, setShowRecentActivity] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  // Live clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    loadProfile()
  }, [])

async function loadProfile() {
  setLoading(true)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { router.push('/'); return }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*, branch:branches(name)')
    .eq('id', user.id)
    .single()

  setProfile(profileData)

  // Check 2FA status for all users
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const verified = factors?.totp?.filter(f => f.status === 'verified')

  // If 2FA not set up redirect to settings
  if (!verified || verified.length === 0) {
    router.push('/settings?require2fa=true')
    return
  }

  if (profileData?.role === 'branch_manager') {
    await loadManagerData()
  }

  setLoading(false)
}

  async function loadManagerData() {
    const today = new Date().toISOString().split('T')[0]
    const monday = getMonday()

    // Staff clocked in today
    const { data: clockedIn } = await supabase
      .from('time_records')
      .select('*, staff:profiles!time_records_staff_id_fkey(full_name, branch:branches(name))')
      .is('clock_out', null)
      .gte('clock_in', today + 'T00:00:00')

    setStaffClockedIn(clockedIn || [])

    // Pending requests
    const { count: leaveCount } = await supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('type', 'leave')

    const { count: shiftCount } = await supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('type', 'shift_change')

    const { count: stockCount } = await supabase
      .from('stock_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    setPendingLeave(leaveCount || 0)
    setPendingShift(shiftCount || 0)
    setPendingStock(stockCount || 0)

    // Low stock items
    const { data: stockItems } = await supabase
      .from('stock_items')
      .select('*')

    const lowStock = (stockItems || []).filter(item =>
      item.current_quantity <= item.min_quantity
    )
    setLowStockItems(lowStock)

    // Weekly hours per staff
    const { data: weekRecords } = await supabase
      .from('time_records')
      .select('*, staff:profiles!time_records_staff_id_fkey(full_name)')
      .gte('clock_in', monday)
      .not('clock_out', 'is', null)

    const hoursMap = {}
    ;(weekRecords || []).forEach(function(r) {
      const name = r.staff?.full_name || 'Unknown'
      if (!hoursMap[name]) hoursMap[name] = 0
      hoursMap[name] += r.total_minutes || 0
    })

    const hoursList = Object.entries(hoursMap)
      .map(function([name, mins]) { return { name, hours: (mins / 60).toFixed(1) } })
      .sort(function(a, b) { return b.hours - a.hours })
      .slice(0, 5)

    setWeeklyHours(hoursList)

    // Total staff
    const { count: staffCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    setTotalStaff(staffCount || 0)

    // Recent activity
    const activities = []

    const { data: recentClockIns } = await supabase
      .from('time_records')
      .select('*, staff:profiles!time_records_staff_id_fkey(full_name)')
      .order('clock_in', { ascending: false })
      .limit(3)

    ;(recentClockIns || []).forEach(function(r) {
      activities.push({
        type: r.clock_out ? 'clock_out' : 'clock_in',
        text: r.staff?.full_name + (r.clock_out ? ' clocked out' : ' clocked in'),
        time: new Date(r.clock_out || r.clock_in)
      })
    })

    const { data: recentRequests } = await supabase
      .from('requests')
      .select('*, staff:profiles!requests_staff_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(3)

    ;(recentRequests || []).forEach(function(r) {
      activities.push({
        type: 'request',
        text: r.staff?.full_name + ' submitted a ' + r.type.replace('_', ' ') + ' request',
        time: new Date(r.created_at)
      })
    })

    activities.sort(function(a, b) { return b.time - a.time })
    setRecentActivity(activities.slice(0, 6))
  }

  function getMonday() {
    const d = new Date()
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  function formatTime(date) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })
  }

  function formatRelativeTime(date) {
    const diff = Math.floor((new Date() - date) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return diff + 'm ago'
    const hours = Math.floor(diff / 60)
    if (hours < 24) return hours + 'h ago'
    return Math.floor(hours / 24) + 'd ago'
  }

  function getActivityIcon(type) {
    if (type === 'clock_in') return '🟢'
    if (type === 'clock_out') return '🔴'
    return '📋'
  }

  function getGreeting() {
    const h = currentTime.getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  // Collapsible section component
  function CollapsibleCard({ title, badge, badgeColor, expanded, onToggle, children, actionLabel, actionPath }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-700 transition"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-700 dark:text-gray-300 text-sm">
            {title}
          </span>
          {badge > 0 && (
            <span className={'text-white text-xs px-2 py-0.5 rounded-full font-medium ' + (badgeColor || 'bg-blue-500')}>
              {badge}
            </span>
          )}
        </div>
        <span
          className="text-gray-400 dark:text-gray-500 text-lg"
          style={{
            display: 'inline-block',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s'
          }}
        >
          ▾
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          {children}
          {actionLabel && actionPath && (
            <div className="px-5 py-3 border-t border-gray-50 dark:border-gray-700">
              <button
                onClick={() => router.push(actionPath)}
                className="text-blue-500 dark:text-blue-400 text-xs font-medium hover:text-blue-700 dark:hover:text-blue-300"
              >
                {actionLabel} →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center  dark:bg-gray-800">
      <p className="text-gray-500 dark:text-white">Loading...</p>
    </div>
  )

  // ── STAFF VIEW ──
  if (profile?.role !== 'branch_manager') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <NavBar
          title="🍽️ Restaurant System"
          rightAction={handleLogout}
          rightLabel="Logout"
          rightStyle="bg-red-50 text-red-500 text-sm px-4 py-2 rounded-lg font-medium hover:bg-red-100 transition"
        />

        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

          {/* Welcome card */}
          <div className="bg-blue-600 rounded-2xl p-6 text-white">
            <p className="text-blue-100 text-sm">{formatDate(currentTime)}</p>
            <h2 className="text-2xl font-bold mt-1">
              {getGreeting()}, {profile?.full_name?.split(' ')[0]}!
            </h2>
            <p className="text-blue-100 text-sm mt-1">
              🏢 {profile?.branch?.name || 'Restaurant'}
            </p>
            <p className="text-white text-4xl font-mono font-bold mt-3">
              {formatTime(currentTime)}
            </p>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => router.push('/time-tracking')}
              className="text-left flex flex-col gap-1 bg-white shadow-sm dark:bg-gray-800 rounded-xl p-3 hover:bg-blue-50 dark:hover:bg-gray-700 transition"
            >
              <p className="text-3xl mb-2">⏱️</p>
              <p className="text-gray-800 dark:text-gray-200 text-sm">Clock In/Out</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs">Track your hours</p>
            </button>
            <button
              onClick={() => router.push('/my-schedule')}
              className="text-left flex flex-col gap-1 bg-white shadow-sm dark:bg-gray-800 rounded-xl p-3 hover:bg-blue-50 dark:hover:bg-gray-700 transition"
            >
              <p className="text-3xl mb-2">📅</p>
              <p className="text-gray-800 dark:text-gray-200 text-sm">My Schedule</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs">View your shifts</p>
            </button>
            <button
              onClick={() => router.push('/requests')}
              className="text-left flex flex-col gap-1 bg-white shadow-sm dark:bg-gray-800 rounded-xl p-3 hover:bg-blue-50 dark:hover:bg-gray-700 transition"
            >
              <p className="text-3xl mb-2">🏖️</p>
              <p className="text-gray-800 dark:text-gray-200 text-sm">Leave & Shifts</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs">Apply or swap</p>
            </button>
            <button
              onClick={() => router.push('/stock')}
              className="text-left flex flex-col gap-1 bg-white shadow-sm dark:bg-gray-800 rounded-xl p-3 hover:bg-blue-50 dark:hover:bg-gray-700 transition"
            >
              <p className="text-3xl mb-2">📦</p>
              <p className="text-gray-800 dark:text-gray-200 text-sm">Stock Request</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs">Request reorders</p>
            </button>
          </div>

          {/* Settings */}
          <button
            onClick={() => router.push('/settings')}
            className="w-full text-left flex flex-col gap-1 bg-white shadow-sm dark:bg-gray-800 rounded-xl p-3 hover:bg-blue-50 dark:hover:bg-gray-700 transition"
          >
            <span className="text-xl font-medium text-gray-600 dark:text-gray-300 ">⚙️</span>
            <span className="font-semibold text-gray-700 dark:text-gray-300 text-sm">Settings & 2FA</span>
            <span className="ml-auto text-gray-300">→</span>
          </button>

        </div>
      </div>
    )
  }

  // ── MANAGER DASHBOARD ──
  const totalPending = pendingLeave + pendingShift + pendingStock
  
  function getBranchSummary() {
    const acc = {}
    staffClockedIn.forEach(function(record) {
      const branchName = record.staff?.branch?.name || 'Main Branch'
      if (!acc[branchName]) acc[branchName] = 0
      acc[branchName]++
    })
    return Object.entries(acc).map(function([branch, count]) {
      return { branch, count }
    })
  }
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">

      {/* Nav with logout */}
      <NavBar
        title="🍽️ Restaurant System"
        rightAction={handleLogout}
        rightLabel="Logout"
        rightStyle="bg-red-50 text-red-500 text-sm px-4 py-2 rounded-lg font-medium hover:bg-red-100 transition"
      />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Welcome card */}
        <div className="bg-blue-600 rounded-2xl p-6 text-white">
          <p className="text-blue-100 text-sm">{formatDate(currentTime)}</p>
          <h2 className="text-2xl font-bold mt-1">
            {getGreeting()}, {profile?.full_name?.split(' ')[0]}!
          </h2>
          <p className="text-blue-100 text-sm mt-1">Branch Manager</p>
          <p className="text-white text-4xl font-mono font-bold mt-3">
            {formatTime(currentTime)}
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{staffClockedIn.length}</p>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">On duty now</p>
          </div>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center"
            onClick={() => setShowPendingAlerts(!showPendingAlerts)}
          >
            <p className={'text-3xl font-bold ' + (totalPending > 0 ? 'text-orange-500' : 'dark:text-blue-600')}>
              {totalPending}
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">Pending actions</p>
          </div>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center"
            onClick={() => setShowLowStock(!showLowStock)}
          >
            <p className={'text-3xl font-bold ' + (lowStockItems.length > 0 ? 'text-red-500' : 'text-gray-800')}>
              {lowStockItems.length}
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">Low stock</p>
          </div>
        </div>

        {/* Pending alerts — collapsible */}
        <CollapsibleCard
          title="⚠️ Pending Alerts"
          badge={totalPending}
          badgeColor="bg-orange-500"
          expanded={showPendingAlerts}
          onToggle={() => setShowPendingAlerts(!showPendingAlerts)}
        >
          <div className="px-5 py-3 space-y-2">
            {totalPending === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-sm py-2 text-center">
                No pending actions
              </p>
            ) : (
              <>
                {pendingLeave > 0 && (
                  <button
                    onClick={() => router.push('/approvals')}
                    className="w-full flex justify-between items-center bg-orange-50 dark:bg-orange-900 rounded-xl px-4 py-3 hover:bg-orange-100 dark:hover:bg-orange-800 transition"
                  >
                    <span className="text-orange-700 dark:text-orange-300 text-sm font-medium">
                      🏖️ Leave Requests
                    </span>
                    <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {pendingLeave}
                    </span>
                  </button>
                )}
                {pendingShift > 0 && (
                  <button
                    onClick={() => router.push('/approvals')}
                    className="w-full flex justify-between items-center bg-purple-50 dark:bg-purple-900 rounded-xl px-4 py-3 hover:bg-purple-100 dark:hover:bg-purple-800 transition"
                  >
                    <span className="text-purple-700 dark:text-purple-300 text-sm font-medium">
                      🔄 Shift Change Requests
                    </span>
                    <span className="bg-purple-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {pendingShift}
                    </span>
                  </button>
                )}
                {pendingStock > 0 && (
                  <button
                    onClick={() => router.push('/stock-manager')}
                    className="w-full flex justify-between items-center bg-blue-50 dark:bg-blue-900 rounded-xl px-4 py-3 hover:bg-blue-100 dark:hover:bg-blue-800 transition"
                  >
                    <span className="text-blue-700 dark:text-blue-300 text-sm font-medium">
                      📦 Stock Requests
                    </span>
                    <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {pendingStock}
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </CollapsibleCard>

        {/* Staff on duty — collapsible */}
        <CollapsibleCard
          title={'🟢 Staff On Duty (' + staffClockedIn.length + '/' + totalStaff + ')'}
          badge={staffClockedIn.length}
          badgeColor="bg-green-500"
          expanded={showStaffOnDuty}
          onToggle={() => setShowStaffOnDuty(!showStaffOnDuty)}
          actionLabel="View all time records"
          actionPath="/time-records"
        >
          {staffClockedIn.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-gray-400 text-sm">No staff clocked in right now</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {staffClockedIn.map(function(record) {
                const clockInTime = new Date(record.clock_in)
                const diffMins = Math.floor((new Date() - clockInTime) / 60000)
                const hours = Math.floor(diffMins / 60)
                const mins = diffMins % 60
                return (
                  <div key={record.id} className="px-5 py-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{record.staff?.full_name}</p>
                      <p className="text-gray-400 text-xs">
                        Since {clockInTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className="bg-green-50 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">
                      {hours > 0 ? hours + 'h ' : ''}{mins}m
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleCard>

        {/* Weekly hours — collapsible */}
        <CollapsibleCard
          title="📊 This Week's Hours"
          expanded={showWeeklyHours}
          onToggle={() => setShowWeeklyHours(!showWeeklyHours)}
          actionLabel="Full report"
          actionPath="/reports"
        >
          {weeklyHours.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-gray-400 text-sm">No hours recorded this week</p>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-3">
              {weeklyHours.map(function(s) {
                const maxHours = Math.max(...weeklyHours.map(x => parseFloat(x.hours)))
                const pct = maxHours > 0 ? (parseFloat(s.hours) / maxHours) * 100 : 0
                return (
                  <div key={s.name}>
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-gray-700 text-sm">{s.name}</p>
                      <p className="text-gray-500 text-xs font-medium">{s.hours}h</p>
                    </div>
                    <div className="bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: pct + '%' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleCard>

        {/* Low stock — collapsible */}
        <CollapsibleCard
          title="⚠️ Low Stock Alerts"
          badge={lowStockItems.length}
          badgeColor="bg-red-500"
          expanded={showLowStock}
          onToggle={() => setShowLowStock(!showLowStock)}
          actionLabel="Manage stock"
          actionPath="/stock-manager"
        >
          {lowStockItems.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-gray-400 text-sm">All stock levels are OK</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {lowStockItems.map(function(item) {
                const isOut = item.current_quantity <= 0
                return (
                  <div key={item.id} className="px-5 py-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{item.name}</p>
                      <p className="text-gray-400 text-xs">{item.category}</p>
                    </div>
                    <span className={'text-xs font-semibold px-2 py-1 rounded-full ' +
                      (isOut ? 'bg-red-100 text-red-700' : 'bg-yellow-50 text-yellow-700')}>
                      {isOut ? 'Out of stock' : item.current_quantity + ' ' + item.unit + ' left'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleCard>

        {/* Recent activity — collapsible */}
        <CollapsibleCard
          title="🕐 Recent Activity"
          expanded={showRecentActivity}
          onToggle={() => setShowRecentActivity(!showRecentActivity)}
        >
          {recentActivity.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-gray-400 text-sm">No recent activity</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentActivity.map(function(activity, index) {
                return (
                  <div key={index} className="px-5 py-3 flex items-center gap-3">
                    <span className="text-lg">{getActivityIcon(activity.type)}</span>
                    <p className="text-gray-600 text-sm flex-1">{activity.text}</p>
                    <p className="text-gray-300 text-xs whitespace-nowrap">
                      {formatRelativeTime(activity.time)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </CollapsibleCard>

        {/* Branch overview - shows all branches */}     
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm">🏢 Branch Overview</h3>
          <div className="space-y-2">
            {staffClockedIn.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-2">No staff on duty</p>
            ) : (
              getBranchSummary().map(function(item) {
                return (
                  <div key={item.branch} className="flex justify-between items-center">
                    <span className="text-gray-700 text-sm">{item.branch}</span>
                    <span className="bg-green-50 text-green-700 text-xs font-medium px-3 py-1 rounded-full">
                      {item.count} on duty
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Quick navigation */}        
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-3">Quick Navigation</h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: '📅', label: 'Schedules', path: '/schedules' },
              { icon: '⏱️', label: 'Time Records', path: '/time-records' },
              { icon: '✅', label: 'Approvals', path: '/approvals' },
              { icon: '📦', label: 'Stock', path: '/stock-manager' },
              { icon: '📊', label: 'Reports', path: '/reports' },
              { icon: '⚙️', label: 'Settings', path: '/settings' },
            ].map(function(item) {
              return (
                <button
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  className="flex flex-col items-center gap-1 rounded-xl p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}