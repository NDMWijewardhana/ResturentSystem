// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'

export default function TimeTracking() {
  const [profile, setProfile] = useState(null)
  const [activeRecord, setActiveRecord] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [elapsed, setElapsed] = useState('')
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [locationStatus, setLocationStatus] = useState('idle')
  // idle | checking | allowed | denied | error | override
  const [locationMessage, setLocationMessage] = useState('')
  const [showOverride, setShowOverride] = useState(false)
  const [overridePin, setOverridePin] = useState('')
  const [restaurantSettings, setRestaurantSettings] = useState(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  // Live elapsed timer
  useEffect(() => {
    if (!activeRecord) return
    const interval = setInterval(() => {
      const start = new Date(activeRecord.clock_in)
      const now = new Date()
      const diff = Math.floor((now - start) / 1000)
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setElapsed(
        String(h).padStart(2, '0') + ':' +
        String(m).padStart(2, '0') + ':' +
        String(s).padStart(2, '0')
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [activeRecord])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*, branch:branches(name, latitude, longitude, radius_metres, override_pin)')
      .eq('id', user.id)
      .single()

    setProfile(profileData)

    // Use branch GPS settings instead of global settings
    if (profileData?.branch) {
      setRestaurantSettings({
        restaurant_lat: profileData.branch.latitude,
        restaurant_lng: profileData.branch.longitude,
        clock_radius_metres: profileData.branch.radius_metres || 100,
        override_pin: profileData.branch.override_pin || '1234'
      })
    }

    // Check active clock in
    const { data: active } = await supabase
      .from('time_records')
      .select('*')
      .eq('staff_id', user.id)
      .is('clock_out', null)
      .single()

    setActiveRecord(active || null)

    // Load recent records
    const { data: recent } = await supabase
      .from('time_records')
      .select('*')
      .eq('staff_id', user.id)
      .not('clock_out', 'is', null)
      .order('clock_in', { ascending: false })
      .limit(10)

    setRecords(recent || [])
    setLoading(false)
  }

  // Calculate distance between two GPS coordinates in metres
  function getDistanceMetres(lat1, lon1, lat2, lon2) {
    const R = 6371000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  async function checkLocation() {
    return new Promise((resolve) => {
      const branchLat = restaurantSettings?.restaurant_lat
      const branchLng = restaurantSettings?.restaurant_lng

      // If branch GPS not set up yet allow clock in
      if (!branchLat || !branchLng ||
          branchLat === '0' || branchLng === '0' ||
          branchLat === null || branchLng === null) {
        resolve({ allowed: true, message: 'Location not configured for this branch' })
        return
      }

      if (!navigator.geolocation) {
        resolve({ allowed: false, message: 'GPS not supported on this device' })
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const staffLat = position.coords.latitude
          const staffLng = position.coords.longitude
          const restLat = parseFloat(branchLat)
          const restLng = parseFloat(branchLng)
          const allowedRadius = parseFloat(restaurantSettings.clock_radius_metres || 100)

          const distance = getDistanceMetres(staffLat, staffLng, restLat, restLng)
          const distanceRounded = Math.round(distance)

          if (distance <= allowedRadius) {
            resolve({
              allowed: true,
              message: 'You are ' + distanceRounded + 'm from ' + (profile?.branch?.name || 'the restaurant')
            })
          } else {
            resolve({
              allowed: false,
              message: 'You are ' + distanceRounded + 'm away. Must be within ' + allowedRadius + 'm of ' + (profile?.branch?.name || 'your branch') + '.'
            })
          }
        },
        (err) => {
          resolve({
            allowed: false,
            message: 'Could not get your location: ' + err.message
          })
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    })
  }

  async function handleClockInAttempt() {
    setWorking(true)
    setLocationStatus('checking')
    setLocationMessage('Checking your location...')

    const result = await checkLocation()

    if (result.allowed) {
      setLocationStatus('allowed')
      setLocationMessage(result.message)
      await performClockIn()
    } else {
      setLocationStatus('denied')
      setLocationMessage(result.message)
      setShowOverride(true)
      setWorking(false)
    }
  }

  async function handleClockOutAttempt() {
    if (!confirm('Are you sure you want to clock out?')) return
    setWorking(true)
    setLocationStatus('checking')
    setLocationMessage('Checking your location...')

    const result = await checkLocation()

    if (result.allowed) {
      setLocationStatus('allowed')
      await performClockOut()
    } else {
      setLocationStatus('denied')
      setLocationMessage(result.message)
      setShowOverride(true)
      setWorking(false)
    }
  }

  async function performClockIn() {
    const { data, error } = await supabase
      .from('time_records')
      .insert({
        staff_id: profile.id,
        clock_in: new Date().toISOString(),
        branch: profile.branch || 'Main Branch',
        notes: notes || null
      })
      .select()
      .single()

    if (error) {
      alert('Error clocking in: ' + error.message)
      setWorking(false)
      return
    }

    setActiveRecord(data)
    setNotes('')
    setShowNotes(false)
    setLocationStatus('idle')
    setLocationMessage('')
    setWorking(false)
  }

  async function performClockOut() {
    const clockOut = new Date()
    const clockIn = new Date(activeRecord.clock_in)
    const totalMinutes = Math.floor((clockOut - clockIn) / 60000)

    const { error } = await supabase
      .from('time_records')
      .update({
        clock_out: clockOut.toISOString(),
        total_minutes: totalMinutes
      })
      .eq('id', activeRecord.id)

    if (error) {
      alert('Error clocking out: ' + error.message)
      setWorking(false)
      return
    }

    setActiveRecord(null)
    setElapsed('')
    setLocationStatus('idle')
    setLocationMessage('')
    setShowOverride(false)
    setWorking(false)
    loadData()
  }

  // Manager override using PIN
async function handleOverride(e) {
    e.preventDefault()

    const correctPin = profile?.branch?.override_pin || '1234'

    if (overridePin !== correctPin) {
      alert('Incorrect PIN. Ask your branch manager for the override PIN.')
      return
    }

    setLocationStatus('override')
    setShowOverride(false)
    setOverridePin('')
    setWorking(true)

    if (activeRecord) {
      await performClockOut()
    } else {
      await performClockIn()
    }
}

  function formatDateTime(isoStr) {
    return new Date(isoStr).toLocaleString('en-GB', {
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit'
    })
  }

  function formatDuration(minutes) {
    if (!minutes) return '-'
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h + 'h ' + m + 'm'
  }

  function formatDate(isoStr) {
    return new Date(isoStr).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short'
    })
  }

  function getWeeklyTotal() {
    const monday = new Date()
    const day = monday.getDay()
    monday.setDate(monday.getDate() - day + (day === 0 ? -6 : 1))
    monday.setHours(0, 0, 0, 0)
    const weekRecords = records.filter(r => new Date(r.clock_in) >= monday)
    const total = weekRecords.reduce((sum, r) => sum + (r.total_minutes || 0), 0)
    return formatDuration(total)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center dark:bg-gray-800">
      <p className="text-gray-500 dark:text-white">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-white dark:bg-gray-800">
      <NavBar
        title="⏱️ Time Tracking"
        backPath="/dashboard"
        backLabel="Dashboard"
      />

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Location status banner */}
        {locationStatus === 'checking' && (
          <div className="bg-blue-50 text-blue-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
            <span className="animate-spin">🔄</span> {locationMessage}
          </div>
        )}
        {locationStatus === 'denied' && (
          <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
            📍 {locationMessage}
          </div>
        )}
        {locationStatus === 'allowed' && (
          <div className="bg-green-50 text-green-700 rounded-xl px-4 py-3 text-sm">
            ✅ {locationMessage}
          </div>
        )}

        {/* Clock In/Out Card */}
        <div className={`rounded-2xl shadow-md p-6 text-center ${activeRecord ? 'bg-green-600' : 'bg-white dark:bg-gray-700  dark:hover:bg-gray-600 rounded-xl p-3' }`}>
          {activeRecord ? (
            <>
              <div className="text-white text-sm font-medium mb-1 opacity-80">
                Currently Working
              </div>
              <div className="text-white text-5xl font-mono font-bold mb-1">
                {elapsed || '00:00:00'}
              </div>
              <div className="text-green-100 text-xs mb-6 dark:text-white">
                Clocked in at {formatDateTime(activeRecord.clock_in)}
              </div>
              <button
                onClick={handleClockOutAttempt}
                disabled={working}
                className="w-full bg-white text-green-600 py-4 rounded-xl font-bold text-lg hover:bg-green-50 transition disabled:opacity-50 shadow-sm"
              >
                {working ? '📡 Checking location...' : '⏹ Clock Out'}
              </button>
            </>
          ) : (
            <>
              <div className="text-gray-400 text-sm mb-2 dark:text-white" >Not clocked in</div>
              <div className="text-gray-800 text-4xl font-bold mb-1 dark:text-white">
                {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-gray-400 text-xs mb-6 dark:text-white">
                {new Date().toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long'
                })}
              </div>

              <button
                onClick={() => setShowNotes(!showNotes)}
                className="text-blue-500 text-xs mb-3 hover:text-blue-700"
              >
                {showNotes ? '− Hide notes' : '+ Add notes (optional)'}
              </button>

              {showNotes && (
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Any notes for this shift..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}

              <button
                onClick={handleClockInAttempt}
                disabled={working}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition disabled:opacity-50 shadow-sm"
              >
                {working ? '📡 Checking location...' : '▶ Clock In'}
              </button>
            </>
          )}
        </div>

        {/* Weekly summary */}
        <div className="bg-white rounded-2xl shadow-sm p-4 flex justify-between items-center dark:bg-gray-700 dark:hover:bg-gray-600 ">
          <div>
            <p className="text-gray-500 text-xs dark:text-white">This week</p>
            <p className="text-gray-800 font-bold text-lg dark:text-white">{getWeeklyTotal()}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs  dark:text-white">Total shifts</p>
            <p className="text-gray-800 font-bold text-lg text-right  dark:text-white">{records.length}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs  dark:text-white">Branch</p>
            <p className="text-gray-800 font-bold text-lg text-right  dark:text-white">
              {profile?.branch?.name || 'Main'}
            </p>
          </div>
        </div>

        {/* Recent records */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden  dark:bg-gray-700">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700 text-sm dark:text-white">Recent History</h3>
          </div>
          {records.length === 0 ? (
            <div className="px-4 py-8 text-center dark:text-white">
              <p className="text-gray-400 text-sm dark:text-white">No records yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {records.map(record => (
                <div key={record.id} className="px-4 py-3 flex justify-between items-center dark:text-white">
                  <div>
                    <p className="text-gray-800 text-sm font-medium dark:text-white">
                      {formatDate(record.clock_in)}
                    </p>
                    <p className="text-gray-400 text-xs dark:text-gray-200">
                      {new Date(record.clock_in).toLocaleTimeString('en-GB', {
                        hour: '2-digit', minute: '2-digit'
                      })}
                      {' – '}
                      {record.clock_out ? new Date(record.clock_out).toLocaleTimeString('en-GB', {
                        hour: '2-digit', minute: '2-digit'
                      }) : 'Active'}
                    </p>
                    {record.notes && (
                      <p className="text-gray-400 text-xs mt-0.5 ">{record.notes}</p>
                    )}
                  </div>
                  <div className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
                    {formatDuration(record.total_minutes)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Override PIN Modal */}
      {showOverride && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 px-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🔓</div>
              <h2 className="text-lg font-bold text-gray-800">Location Override</h2>
              <p className="text-gray-500 text-sm mt-1">
                GPS check failed. Ask your branch manager for the override PIN.
              </p>
              <p className="text-red-500 text-xs mt-2 bg-red-50 rounded-lg px-3 py-2">
                📍 {locationMessage}
              </p>
            </div>
            <form onSubmit={handleOverride} className="space-y-4">
              <input
                type="password"
                inputMode="numeric"
                value={overridePin}
                onChange={e => setOverridePin(e.target.value)}
                maxLength={6}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••"
                autoFocus
              />
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition"
              >
                Verify &amp; Clock {activeRecord ? 'Out' : 'In'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOverride(false)
                  setLocationStatus('idle')
                  setLocationMessage('')
                }}
                className="w-full text-gray-500 text-sm hover:text-gray-700 py-2"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}