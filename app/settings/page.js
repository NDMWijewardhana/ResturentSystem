// @ts-nocheck
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('location')
  const [profile, setProfile] = useState(null)

  // Location settings
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [radius, setRadius] = useState('100')
  const [pin, setPin] = useState('1234')
  const [saving, setSaving] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [locationSuccess, setLocationSuccess] = useState('')
  const [locationError, setLocationError] = useState('')

  // 2FA settings
  const [twoFAStep, setTwoFAStep] = useState('start')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [otp, setOtp] = useState('')
  const [twoFAError, setTwoFAError] = useState('')
  const [twoFALoading, setTwoFALoading] = useState(false)

  // Staff & Branches
  const [staff, setStaff] = useState([])
  const [branches, setBranches] = useState([])
  const [showStaffForm, setShowStaffForm] = useState(false)
  const [showBranchForm, setShowBranchForm] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null)
  const [staffSaving, setStaffSaving] = useState(false)
  const [staffError, setStaffError] = useState('')
  const [staffSuccess, setStaffSuccess] = useState('')
  const [staffForm, setStaffForm] = useState({
    full_name: '', email: '', password: '', role: 'staff', branch_id: '', phone: ''
  })
  const [branchForm, setBranchForm] = useState({ name: '', address: '' })

  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()
  const [required2FA, setRequired2FA] = useState(false)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    // Check if redirected here because 2FA is required
    const params = new URLSearchParams(window.location.search)
    if (params.get('require2fa') === 'true') {
      setRequired2FA(true)
      setActiveTab('2fa')
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    setProfile(profileData)

    if (profileData?.role === 'branch_manager') {
      // Location settings
      const { data } = await supabase.from('settings').select('key, value')
      if (data) {
        data.forEach(function(s) {
          if (s.key === 'restaurant_lat') setLat(s.value)
          if (s.key === 'restaurant_lng') setLng(s.value)
          if (s.key === 'clock_radius_metres') setRadius(s.value)
          if (s.key === 'override_pin') setPin(s.value)
        })
      }

      // Staff & branches
      await loadStaffData()
    }

    // 2FA status for all users
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const verified = factors?.totp?.filter(f => f.status === 'verified')
    if (verified?.length > 0) {
      setTwoFAStep('done')
    }

    setLoading(false)
  }

  async function loadStaffData() {
    const { data: staffData } = await supabase
      .from('profiles')
      .select('*, branch:branches(name)')
      .order('full_name')
    setStaff(staffData || [])

    const { data: branchData } = await supabase
      .from('branches')
      .select('*')
      .order('name')
    setBranches(branchData || [])

    if (branchData && branchData.length > 0) {
      setStaffForm(prev => ({ ...prev, branch_id: prev.branch_id || branchData[0].id }))
    }
  }

  function getRadiusButtonClass(r) {
    const base = 'flex-1 py-2 rounded-lg text-sm font-medium border transition '
    if (radius === r) return base + 'bg-blue-600 text-white border-blue-600'
    return base + 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
  }

  async function detectLocation() {
    setDetecting(true)
    setLocationError('')
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser')
      setDetecting(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      function(position) {
        setLat(position.coords.latitude.toFixed(6))
        setLng(position.coords.longitude.toFixed(6))
        setDetecting(false)
        setLocationSuccess('Location detected! Save to confirm.')
        setTimeout(function() { setLocationSuccess('') }, 3000)
      },
      function(err) {
        setLocationError('Could not detect location: ' + err.message)
        setDetecting(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function handleSaveLocation(e) {
    e.preventDefault()
    setSaving(true)
    setLocationError('')

    const updates = [
      { key: 'restaurant_lat', value: lat },
      { key: 'restaurant_lng', value: lng },
      { key: 'clock_radius_metres', value: radius },
      { key: 'override_pin', value: pin }
    ]

    for (const update of updates) {
      const { error } = await supabase
        .from('settings')
        .update({ value: update.value })
        .eq('key', update.key)

      if (error) {
        setLocationError('Error saving: ' + error.message)
        setSaving(false)
        return
      }
    }

    setLocationSuccess('Settings saved successfully!')
    setTimeout(function() { setLocationSuccess('') }, 3000)
    setSaving(false)
  }

  // 2FA functions
  async function handleEnroll() {
    setTwoFALoading(true)
    setTwoFAError('')

    const { data: existing } = await supabase.auth.mfa.listFactors()
    if (existing?.totp?.length > 0) {
      for (const factor of existing.totp) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Restaurant System'
    })

    if (error) {
      setTwoFAError(error.message)
      setTwoFALoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const otpauthUrl = `otpauth://totp/RestaurantSystem:${user.email}?secret=${data.totp.secret}&issuer=RestaurantSystem`

    try {
      const dataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: 200, margin: 1, errorCorrectionLevel: 'L'
      })
      setQrCodeDataUrl(dataUrl)
    } catch (qrError) {
      setTwoFAError('Failed to generate QR code: ' + qrError.message)
      setTwoFALoading(false)
      return
    }

    setSecret(data.totp.secret)
    setFactorId(data.id)
    setTwoFAStep('scan')
    setTwoFALoading(false)
  }

  async function handleVerify2FA(e) {
  e.preventDefault()
  setTwoFALoading(true)
  setTwoFAError('')

  const { data: challenge, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId })

  if (challengeError) {
    setTwoFAError(challengeError.message)
    setTwoFALoading(false)
    return
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId, challengeId: challenge.id, code: otp,
  })

  if (verifyError) {
    setTwoFAError('Invalid code. Please try again.')
    setTwoFALoading(false)
    return
  }

  setTwoFAStep('done')
  setTwoFALoading(false)

  // If 2FA was required redirect to dashboard
  if (required2FA) {
    setTimeout(() => router.push('/dashboard'), 1500)
  }
}

  async function handleUnenroll() {
    setTwoFALoading(true)
    const { data } = await supabase.auth.mfa.listFactors()
    if (data?.totp?.length > 0) {
      await supabase.auth.mfa.unenroll({ factorId: data.totp[0].id })
    }
    setTwoFAStep('start')
    setTwoFALoading(false)
  }

  // Staff management functions
  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let pass = ''
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return pass
  }

  function openAddStaffForm() {
    setEditingStaff(null)
    setStaffForm({
      full_name: '', email: '', password: generatePassword(),
      role: 'staff', branch_id: branches[0]?.id || '', phone: ''
    })
    setShowStaffForm(true)
    setStaffError('')
  }

  function openEditStaffForm(member) {
    setEditingStaff(member)
    setStaffForm({
      full_name: member.full_name, email: member.email, password: '',
      role: member.role, branch_id: member.branch_id || '', phone: member.phone || ''
    })
    setShowStaffForm(true)
    setStaffError('')
  }

  async function handleAddStaff(e) {
    e.preventDefault()
    setStaffSaving(true)
    setStaffError('')

    const response = await fetch('/api/create-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staffForm)
    })

    const result = await response.json()

    if (!response.ok) {
      setStaffError(result.error || 'Failed to create staff member')
      setStaffSaving(false)
      return
    }

    setStaffSuccess(`Staff created! Temporary password: ${staffForm.password}`)
    setShowStaffForm(false)
    setTimeout(() => setStaffSuccess(''), 10000)
    loadStaffData()
    setStaffSaving(false)
  }

  async function handleUpdateStaff(e) {
    e.preventDefault()
    setStaffSaving(true)
    setStaffError('')

    const response = await fetch('/api/manage-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        userId: editingStaff.id,
        updates: {
          full_name: staffForm.full_name,
          role: staffForm.role,
          branch_id: staffForm.branch_id,
          phone: staffForm.phone
        }
      })
    })

    const result = await response.json()

    if (!response.ok) {
      setStaffError(result.error || 'Failed to update')
      setStaffSaving(false)
      return
    }

    setStaffSuccess('Staff member updated!')
    setShowStaffForm(false)
    setTimeout(() => setStaffSuccess(''), 3000)
    loadStaffData()
    setStaffSaving(false)
  }

  async function handleToggleActive(member) {
    const action = member.is_active ? 'deactivate' : 'activate'
    if (!confirm(`${action === 'deactivate' ? 'Deactivate' : 'Activate'} ${member.full_name}?`)) return

    await fetch('/api/manage-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, userId: member.id })
    })
    loadStaffData()
  }

  async function handleDeleteStaff(member) {
    if (!confirm(`Permanently delete ${member.full_name}? This cannot be undone.`)) return

    await fetch('/api/manage-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', userId: member.id })
    })
    loadStaffData()
  }

  async function handleResetPassword(member) {
    const newPassword = generatePassword()
    if (!confirm(`Reset password for ${member.full_name}? New password: ${newPassword}`)) return

    const response = await fetch('/api/manage-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_password', userId: member.id, updates: { newPassword } })
    })

    if (response.ok) {
      alert(`Password reset! New password: ${newPassword}\n\nShare this with ${member.full_name} securely.`)
    }
  }

  async function handleAddBranch(e) {
    e.preventDefault()
    setStaffSaving(true)
    setStaffError('')

    const { error: insertError } = await supabase.from('branches').insert(branchForm)

    if (insertError) {
      setStaffError(insertError.message)
      setStaffSaving(false)
      return
    }

    setBranchForm({ name: '', address: '' })
    setShowBranchForm(false)
    loadStaffData()
    setStaffSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <nav className="bg-white shadow-sm px-4 py-4 flex justify-between items-center">
        <button onClick={() => router.push('/dashboard')} className="text-blue-500 text-sm font-medium">
          ← Dashboard
        </button>
        <h1 className="text-lg font-bold text-gray-800">⚙️ Settings</h1>
        <div className="w-16" />
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Tab switcher */}
        <div className="bg-white rounded-2xl shadow-sm p-2 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('location')}
            className={'flex-1 py-3 rounded-xl text-xs sm:text-sm font-medium transition whitespace-nowrap px-2 ' +
              (activeTab === 'location' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50')}
          >
            📍 Location
          </button>
          <button
            onClick={() => setActiveTab('2fa')}
            className={'flex-1 py-3 rounded-xl text-xs sm:text-sm font-medium transition whitespace-nowrap px-2 ' +
              (activeTab === '2fa' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50')}
          >
            🔐 2FA
            {twoFAStep === 'done' && (
              <span className="ml-1 bg-green-500 text-white text-xs px-1.5 rounded-full">ON</span>
            )}
          </button>
          {profile?.role === 'branch_manager' && (
            <button
              onClick={() => setActiveTab('staff')}
              className={'flex-1 py-3 rounded-xl text-xs sm:text-sm font-medium transition whitespace-nowrap px-2 ' +
                (activeTab === 'staff' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50')}
            >
              👥 Staff
            </button>
          )}
        </div>

        {/* ── LOCATION TAB ── */}
        {activeTab === 'location' && (
          <div className="space-y-4">
            {profile?.role !== 'branch_manager' ? (
              <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                <p className="text-4xl mb-3">🔒</p>
                <p className="text-gray-600 text-sm">
                  Location settings are only available to branch managers.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h2 className="font-bold text-gray-800 mb-1">📍 Restaurant Location</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Stand inside the restaurant and tap Detect My Location.
                </p>

                {locationSuccess && (
                  <div className="bg-green-50 text-green-700 rounded-xl px-4 py-3 text-sm mb-4">
                    ✅ {locationSuccess}
                  </div>
                )}
                {locationError && (
                  <div className="bg-red-50 text-red-600 rounded-xl px-4 py-3 text-sm mb-4">
                    {locationError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={detectLocation}
                  disabled={detecting}
                  className="w-full bg-green-600 text-white py-3 rounded-xl font-medium hover:bg-green-700 transition disabled:opacity-50 mb-6"
                >
                  {detecting ? '📡 Detecting...' : '📍 Detect My Location'}
                </button>

                <form onSubmit={handleSaveLocation} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                      <input
                        type="text" value={lat} onChange={e => setLat(e.target.value)} required
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        placeholder="e.g. 60.169856"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                      <input
                        type="text" value={lng} onChange={e => setLng(e.target.value)} required
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        placeholder="e.g. 24.938379"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Allowed radius (metres)
                    </label>
                    <div className="flex gap-3">
                      {['50', '100', '200'].map(function(r) {
                        return (
                          <button key={r} type="button" onClick={() => setRadius(r)} className={getRadiusButtonClass(r)}>
                            {r}m
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => window.open('https://www.google.com/maps?q=' + lat + ',' + lng)}
                    className="w-full bg-gray-50 text-blue-500 py-3 rounded-xl text-sm hover:bg-gray-100 transition"
                  >
                    Verify on Google Maps
                  </button>

                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="font-bold text-gray-800 mb-1">🔓 Override PIN</h3>
                    <p className="text-gray-500 text-sm mb-3">
                      Staff enter this PIN when GPS fails indoors.
                    </p>
                    <input
                      type="text" value={pin} onChange={e => setPin(e.target.value)} maxLength={6}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    type="submit" disabled={saving || !lat || !lng}
                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ── 2FA TAB ── */}
        {activeTab === '2fa' && (
          <div className="bg-white rounded-2xl shadow-sm p-8">
            {twoFAStep === 'start' && (
              <div className="text-center">
                <div className="text-5xl mb-4">🔐</div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Two-Factor Authentication</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Add an extra layer of security using Google Authenticator or any TOTP app.
                </p>
                <div className="bg-blue-50 rounded-xl p-4 text-left mb-6">
                  <p className="text-blue-800 text-sm font-medium mb-2">Before you start:</p>
                  <ol className="text-blue-700 text-sm space-y-1 list-decimal list-inside">
                    <li>Install Google Authenticator on your phone</li>
                    <li>Or use Authy or any TOTP authenticator app</li>
                    <li>Come back here and click Enable 2FA</li>
                  </ol>
                </div>
                {twoFAError && (
                  <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">{twoFAError}</div>
                )}
                <button
                  onClick={handleEnroll} disabled={twoFALoading}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {twoFALoading ? 'Setting up...' : 'Enable 2FA'}
                </button>
              </div>
            )}

            {twoFAStep === 'scan' && (
              <div className="text-center">
                <div className="text-4xl mb-3">📱</div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Scan QR Code</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Open your authenticator app and scan this QR code
                </p>
                {qrCodeDataUrl && (
                  <div className="flex justify-center mb-4">
                    <div className="bg-white p-3 rounded-xl border-2 border-gray-200 inline-block">
                      <img src={qrCodeDataUrl} alt="2FA QR Code" width={180} height={180} />
                    </div>
                  </div>
                )}
                <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
                  <p className="text-gray-700 text-sm font-medium mb-2">Or enter this key manually:</p>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <p className="text-gray-800 text-sm font-mono break-all select-all text-center">{secret}</p>
                  </div>
                </div>
                <button
                  onClick={() => setTwoFAStep('verify')}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition"
                >
                  I have scanned it
                </button>
              </div>
            )}

            {twoFAStep === 'verify' && (
              <div className="text-center">
                <div className="text-4xl mb-3">✅</div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Verify Setup</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Enter the 6-digit code from your authenticator app
                </p>
                {twoFAError && (
                  <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">{twoFAError}</div>
                )}
                <form onSubmit={handleVerify2FA} className="space-y-4">
                  <input
                    type="text" inputMode="numeric" value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} maxLength={6} required
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="000000" autoFocus
                  />
                  <button
                    type="submit" disabled={twoFALoading || otp.length !== 6}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {twoFALoading ? 'Verifying...' : 'Confirm and Enable'}
                  </button>
                  <button
                    type="button" onClick={() => setTwoFAStep('scan')}
                    className="w-full text-sm text-gray-500 hover:text-gray-700"
                  >
                    Back to QR Code
                  </button>
                </form>
              </div>
            )}

            {twoFAStep === 'done' && (
              <div className="text-center">
                <div className="text-5xl mb-4">🎉</div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">2FA is Active</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Your account is protected with two-factor authentication.
                </p>
                <div className="bg-green-50 rounded-xl p-4 mb-6 text-left">
                  <p className="text-green-800 text-sm">✅ Next login will ask for your 6-digit code</p>
                </div>
                {/* Only managers can remove 2FA */}
                {profile?.role === 'branch_manager' && (
                  <button
                    onClick={handleUnenroll}
                    disabled={twoFALoading}
                    className="w-full text-sm text-red-400 hover:text-red-600 py-2"
                  >
                    {twoFALoading ? 'Removing...' : 'Remove 2FA'}
                  </button>
                )}
                {/* Staff see a locked message instead */}
                {profile?.role !== 'branch_manager' && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-500 text-xs text-center">
                      🔒 2FA is mandatory and cannot be disabled for staff accounts
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STAFF TAB ── */}
        {activeTab === 'staff' && profile?.role === 'branch_manager' && (
          <div className="space-y-4">

            {staffSuccess && (
              <div className="bg-green-50 text-green-700 rounded-xl px-4 py-3 text-sm font-medium break-all">
                ✅ {staffSuccess}
              </div>
            )}

            {/* Branches */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-gray-700 text-sm">🏢 Branches</h3>
                <button
                  onClick={() => setShowBranchForm(true)}
                  className="text-blue-500 text-xs font-medium hover:text-blue-700"
                >
                  + Add Branch
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {branches.map(function(b) {
                  return (
                    <span key={b.id} className="bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-full">
                      {b.name}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Staff list */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-semibold text-gray-700 text-sm">All Staff ({staff.length})</h3>
                <button
                  onClick={openAddStaffForm}
                  className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition"
                >
                  + Add Staff
                </button>
              </div>

              <div className="divide-y divide-gray-50">
                {staff.map(function(member) {
                  return (
                    <div key={member.id} className="px-5 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-800 text-sm">{member.full_name}</p>
                        {!member.is_active && (
                          <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">Inactive</span>
                        )}
                        <span className={'text-xs px-2 py-0.5 rounded-full capitalize ' +
                          (member.role === 'branch_manager' ? 'bg-purple-50 text-purple-700' : 'bg-gray-50 text-gray-600')}>
                          {member.role === 'branch_manager' ? 'Manager' : 'Staff'}
                        </span>
                      </div>
                      <p className="text-gray-500 text-xs mt-0.5">{member.email}</p>
                      <p className="text-gray-400 text-xs">
                        {member.branch?.name || 'No branch assigned'}
                        {member.phone && ' · ' + member.phone}
                      </p>

                      <div className="flex gap-3 mt-2 flex-wrap">
                        <button onClick={() => openEditStaffForm(member)} className="text-blue-500 text-xs font-medium hover:text-blue-700">
                          Edit
                        </button>
                        <button onClick={() => handleResetPassword(member)} className="text-amber-500 text-xs font-medium hover:text-amber-700">
                          Reset Password
                        </button>
                        <button onClick={() => handleToggleActive(member)} className="text-gray-500 text-xs font-medium hover:text-gray-700">
                          {member.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => handleDeleteStaff(member)} className="text-red-400 text-xs font-medium hover:text-red-600">
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Add/Edit Staff Modal */}
      {showStaffForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 px-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-800">
                {editingStaff ? 'Edit Staff Member' : 'Add Staff Member'}
              </h2>
              <button onClick={() => setShowStaffForm(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            {staffError && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">{staffError}</div>
            )}

            <form onSubmit={editingStaff ? handleUpdateStaff : handleAddStaff} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text" value={staffForm.full_name}
                  onChange={e => setStaffForm({ ...staffForm, full_name: e.target.value })} required
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email" value={staffForm.email}
                  onChange={e => setStaffForm({ ...staffForm, email: e.target.value })} required
                  disabled={!!editingStaff}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>

              {!editingStaff && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
                  <div className="flex gap-2">
                    <input
                      type="text" value={staffForm.password}
                      onChange={e => setStaffForm({ ...staffForm, password: e.target.value })} required
                      className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button" onClick={() => setStaffForm({ ...staffForm, password: generatePassword() })}
                      className="bg-gray-100 text-gray-600 px-4 rounded-lg text-sm hover:bg-gray-200 transition"
                    >
                      🔄
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={staffForm.role} onChange={e => setStaffForm({ ...staffForm, role: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="staff">Staff</option>
                  <option value="branch_manager">Branch Manager</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                <select
                  value={staffForm.branch_id} onChange={e => setStaffForm({ ...staffForm, branch_id: e.target.value })} required
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {branches.map(function(b) {
                    return <option key={b.id} value={b.id}>{b.name}</option>
                  })}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                <input
                  type="tel" value={staffForm.phone}
                  onChange={e => setStaffForm({ ...staffForm, phone: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+358..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button" onClick={() => setShowStaffForm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={staffSaving}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {staffSaving ? 'Saving...' : editingStaff ? 'Update' : 'Create Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Branch Modal */}
      {showBranchForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 px-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-gray-800">Add Branch</h2>
              <button onClick={() => setShowBranchForm(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <form onSubmit={handleAddBranch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
                <input
                  type="text" value={branchForm.name}
                  onChange={e => setBranchForm({ ...branchForm, name: e.target.value })} required
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Downtown Branch"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address (optional)</label>
                <input
                  type="text" value={branchForm.address}
                  onChange={e => setBranchForm({ ...branchForm, address: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit" disabled={staffSaving}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                {staffSaving ? 'Saving...' : 'Add Branch'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}