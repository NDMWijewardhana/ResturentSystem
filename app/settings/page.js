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

  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    setProfile(profileData)

    // Load location settings (manager only)
    if (profileData?.role === 'branch_manager') {
      const { data } = await supabase
        .from('settings')
        .select('key, value')

      if (data) {
        data.forEach(function(s) {
          if (s.key === 'restaurant_lat') setLat(s.value)
          if (s.key === 'restaurant_lng') setLng(s.value)
          if (s.key === 'clock_radius_metres') setRadius(s.value)
          if (s.key === 'override_pin') setPin(s.value)
        })
      }
    }

    // Load 2FA status for all users
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const verified = factors?.totp?.filter(f => f.status === 'verified')
    if (verified?.length > 0) {
      setTwoFAStep('done')
    }

    setLoading(false)
  }

  function getRadiusButtonClass(r) {
    const base = 'flex-1 py-2 rounded-lg text-sm font-medium border transition '
    if (radius === r) {
      return base + 'bg-blue-600 text-white border-blue-600'
    }
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
        width: 200,
        margin: 1,
        errorCorrectionLevel: 'L'
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
      factorId,
      challengeId: challenge.id,
      code: otp,
    })

    if (verifyError) {
      setTwoFAError('Invalid code. Please try again.')
      setTwoFALoading(false)
      return
    }

    setTwoFAStep('done')
    setTwoFALoading(false)
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Nav */}
      <nav className="bg-white shadow-sm px-4 py-4 flex justify-between items-center">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-blue-500 text-sm font-medium"
        >
          ← Dashboard
        </button>
        <h1 className="text-lg font-bold text-gray-800">⚙️ Settings</h1>
        <div className="w-16" />
      </nav>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Tab switcher */}
        <div className="bg-white rounded-2xl shadow-sm p-2 flex gap-2">
          <button
            onClick={() => setActiveTab('location')}
            className={
              'flex-1 py-3 rounded-xl text-sm font-medium transition ' +
              (activeTab === 'location'
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:bg-gray-50')
            }
          >
            📍 Location
          </button>
          <button
            onClick={() => setActiveTab('2fa')}
            className={
              'flex-1 py-3 rounded-xl text-sm font-medium transition ' +
              (activeTab === '2fa'
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:bg-gray-50')
            }
          >
            🔐 Two-Factor Auth
            {twoFAStep === 'done' && (
              <span className="ml-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
                ON
              </span>
            )}
          </button>
        </div>

        {/* ── LOCATION TAB ── */}
        {activeTab === 'location' && (
          <div className="space-y-4">

            {/* Only managers see location settings */}
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
                  Staff must be within the allowed radius to clock in or out.
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Latitude
                      </label>
                      <input
                        type="text"
                        value={lat}
                        onChange={e => setLat(e.target.value)}
                        required
                        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        placeholder="e.g. 60.169856"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Longitude
                      </label>
                      <input
                        type="text"
                        value={lng}
                        onChange={e => setLng(e.target.value)}
                        required
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
                          <button
                            key={r}
                            type="button"
                            onClick={() => setRadius(r)}
                            className={getRadiusButtonClass(r)}
                          >
                            {r}m
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-gray-400 text-xs mt-2">
                      100m works well for most restaurants. Use 200m if GPS is unreliable indoors.
                    </p>
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
                      type="text"
                      value={pin}
                      onChange={e => setPin(e.target.value)}
                      maxLength={6}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter 4-6 digit PIN"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving || !lat || !lng}
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

            {/* Start */}
            {twoFAStep === 'start' && (
              <div className="text-center">
                <div className="text-5xl mb-4">🔐</div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">
                  Two-Factor Authentication
                </h2>
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
                  <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
                    {twoFAError}
                  </div>
                )}
                <button
                  onClick={handleEnroll}
                  disabled={twoFALoading}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {twoFALoading ? 'Setting up...' : 'Enable 2FA'}
                </button>
              </div>
            )}

            {/* Scan QR */}
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
                <div className="bg-yellow-50 rounded-xl p-3 mb-4 text-left">
                  <p className="text-yellow-800 text-xs font-medium">
                    Using this on your phone?
                  </p>
                  <p className="text-yellow-700 text-xs mt-1">
                    Enter the manual code below in your authenticator app instead.
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
                  <p className="text-gray-700 text-sm font-medium mb-2">
                    Enter this key manually:
                  </p>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <p className="text-gray-800 text-sm font-mono break-all select-all text-center">
                      {secret}
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 mt-2">
                    <p className="text-blue-800 text-xs font-medium mb-1">How to enter manually:</p>
                    <ol className="text-blue-700 text-xs space-y-1 list-decimal list-inside">
                      <li>Open Google Authenticator</li>
                      <li>Tap the + button</li>
                      <li>Choose Enter a setup key</li>
                      <li>Enter your email as account name</li>
                      <li>Paste the key above</li>
                    </ol>
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

            {/* Verify */}
            {twoFAStep === 'verify' && (
              <div className="text-center">
                <div className="text-4xl mb-3">✅</div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Verify Setup</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Enter the 6-digit code from your authenticator app to confirm
                </p>
                {twoFAError && (
                  <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
                    {twoFAError}
                  </div>
                )}
                <form onSubmit={handleVerify2FA} className="space-y-4">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    maxLength={6}
                    required
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="000000"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={twoFALoading || otp.length !== 6}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {twoFALoading ? 'Verifying...' : 'Confirm and Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTwoFAStep('scan')}
                    className="w-full text-sm text-gray-500 hover:text-gray-700"
                  >
                    Back to QR Code
                  </button>
                </form>
              </div>
            )}

            {/* Done */}
            {twoFAStep === 'done' && (
              <div className="text-center">
                <div className="text-5xl mb-4">🎉</div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">
                  2FA is Active
                </h2>
                <p className="text-gray-500 text-sm mb-6">
                  Your account is protected with two-factor authentication.
                  You will need your authenticator app every time you log in.
                </p>
                <div className="bg-green-50 rounded-xl p-4 mb-6 text-left">
                  <p className="text-green-800 text-sm">
                    ✅ Next login will ask for your 6-digit code
                  </p>
                </div>
                <button
                  onClick={handleUnenroll}
                  disabled={twoFALoading}
                  className="w-full text-sm text-red-400 hover:text-red-600 py-2"
                >
                  {twoFALoading ? 'Removing...' : 'Remove 2FA'}
                </button>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  )
}