'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadProfile() {
      // Step 1: check user session
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError || !user) {
        console.log('No user session:', userError)
        router.push('/')
        return
      }

      console.log('User found:', user.id)

      // Step 2: fetch profile
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.log('Profile error:', profileError)
        setError('Could not load profile: ' + profileError.message)
        return
      }

      console.log('Profile loaded:', data)
      setProfile(data)
    }

    loadProfile()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  // Show error state
  if (error) return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <h1 className="text-lg font-bold text-gray-800">🍽️ Restaurant System</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-red-500 hover:text-red-700 font-medium"
        >
          Logout
        </button>
      </nav>
      <div className="max-w-lg mx-auto mt-10 px-4">
        <div className="bg-red-50 text-red-600 rounded-2xl p-6">
          <p className="font-medium mb-1">Error loading profile</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    </div>
  )

  // Show loading state
  if (!profile) return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <h1 className="text-lg font-bold text-gray-800">🍽️ Restaurant System</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-red-500 hover:text-red-700 font-medium"
        >
          Logout
        </button>
      </nav>
      <div className="max-w-lg mx-auto mt-10 px-4">
        <div className="bg-white rounded-2xl shadow-md p-6 text-center">
          <p className="text-gray-500">Loading your profile...</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <h1 className="text-lg font-bold text-gray-800">🍽️ Restaurant System</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-red-500 hover:text-red-700 font-medium"
        >
          Logout
        </button>
      </nav>

      {/* Content */}
      <div className="max-w-lg mx-auto mt-10 px-4 space-y-4">
        {/* Welcome card */}
        <div className="bg-white rounded-2xl shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-1">
            Welcome, {profile.full_name} 👋
          </h2>
          <p className="text-gray-500 text-sm">
            Role: <span className="font-medium capitalize text-blue-600">{profile.role}</span>
          </p>
          <p className="text-gray-500 text-sm">Email: {profile.email}</p>
        </div>

        {/* Quick actions based on role */}
        {profile.role === 'branch_manager' && (
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h3 className="font-semibold text-gray-700 mb-3">Manager Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => router.push('/schedules')}
                className="bg-blue-50 text-blue-700 rounded-xl p-4 text-sm font-medium hover:bg-blue-100 transition">
                📅 Schedules
              </button>
              <button 
                onClick={() => router.push('/approvals')}
                className="bg-green-50 text-green-700 rounded-xl p-4 text-sm font-medium hover:bg-green-100 transition">
                ✅ Approvals
              </button>
              <button 
                onClick={() => router.push('/stock-manager')}
                className="bg-purple-50 text-purple-700 rounded-xl p-4 text-sm font-medium hover:bg-purple-100 transition">
                📦 Stock
              </button>
              <button 
                onClick={() => router.push('/reports')}
                className="bg-orange-50 text-orange-700 rounded-xl p-4 text-sm font-medium hover:bg-orange-100 transition">
                📊 Reports
              </button>
              <button
                onClick={() => router.push('/time-records')}
                className="bg-blue-50 text-blue-700 rounded-xl p-4 text-sm font-medium hover:bg-blue-100 transition">
                ⏱️ Time Records
              </button>              
              <button
                onClick={() => router.push('/settings')}
                className="bg-gray-50 text-gray-700 rounded-xl p-4 text-sm font-medium hover:bg-gray-100 transition">
                ⚙️ Settings
              </button>             
            </div>
          </div>
        )}

        {profile.role === 'staff' && (
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h3 className="font-semibold text-gray-700 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => router.push('/time-tracking')}
                className="bg-blue-50 text-blue-700 rounded-xl p-4 text-sm font-medium hover:bg-blue-100 transition">
                🕐 Clock In/Out
              </button>
              <button 
                onClick={() => router.push('/my-schedule')}
                className="bg-green-50 text-green-700 rounded-xl p-4 text-sm font-medium hover:bg-green-100 transition">
                📅 My Schedule
              </button>
              <button 
                 onClick={() => router.push('/requests')}
                 className="bg-purple-50 text-purple-700 rounded-xl p-4 text-sm font-medium hover:bg-purple-100 transition">
                🔄 Shift Change
              </button>
              <button 
                onClick={() => router.push('/requests')}
                className="bg-orange-50 text-orange-700 rounded-xl p-4 text-sm font-medium hover:bg-orange-100 transition">
                🏖️ Apply Leave
              </button>
              <button
                onClick={() => router.push('/stock')}
                className="bg-purple-50 text-purple-700 rounded-xl p-4 text-sm font-medium hover:bg-purple-100 transition">
                📦 Stock Request
             </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}