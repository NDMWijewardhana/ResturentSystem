'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'

export default function Setup2FA() {
  const [step, setStep] = useState('start')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkExisting2FA()
  }, [])

  async function checkExisting2FA() {
  const { data } = await supabase.auth.mfa.listFactors()
  const verified = data?.totp?.filter(f => f.factor_type === 'totp' && f.status === 'verified')
  if (verified?.length > 0) {
    setStep('done')
  }
}

  async function handleEnroll() {
    setLoading(true)
    setError('')

    const { data: existing } = await supabase.auth.mfa.listFactors()
    if (existing?.totp?.length > 0) {
        for (const factor of existing.totp) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
        }
    }

    // Now enroll fresh
    const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Restaurant System'
    })

    if (error) {
        setError(error.message)
        setLoading(false)
        return
    }

    // Generate QR code
    const { data: { user } } = await supabase.auth.getUser()
    const otpauthUrl = `otpauth://totp/RestaurantSystem:${user.email}?secret=${data.totp.secret}&issuer=RestaurantSystem`

    try {
    const dataUrl = await QRCode.toDataURL(otpauthUrl, {
        width: 256,
        margin: 1,
        errorCorrectionLevel: 'L',
    })
    setQrCodeDataUrl(dataUrl)
    } catch (qrError) {
    setError('Failed to generate QR code: ' + qrError.message)
    setLoading(false)
    return
    }

    setSecret(data.totp.secret)
    setFactorId(data.id)
    setStep('scan')
    setLoading(false)
  
  }

  async function handleVerify(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId })

    if (challengeError) {
      setError(challengeError.message)
      setLoading(false)
      return
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: otp,
    })

    if (verifyError) {
      setError('Invalid code. Please try again.')
      setLoading(false)
      return
    }

    setStep('done')
    setLoading(false)
  }

  async function handleUnenroll() {
    setLoading(true)
    const { data } = await supabase.auth.mfa.listFactors()
    if (data?.totp?.length > 0) {
      await supabase.auth.mfa.unenroll({ factorId: data.totp[0].id })
    }
    setStep('start')
    setLoading(false)
  }

  return (    
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <h1 className="text-lg font-bold text-gray-800">🍽️ Restaurant System</h1>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-sm text-blue-500 hover:text-blue-700 font-medium"
        >
          ← Back to Dashboard
        </button>
      </nav>

      <div className="max-w-sm mx-auto mt-10 px-4">
        <div className="bg-white rounded-2xl shadow-md p-8">
          {/* STEP: Start */}
          {/* Mandatory warning */}
          {required2FA && twoFAStep !== 'done' && (
            <div className="bg-red-50 rounded-xl p-4 mb-6 text-center">
              <p className="text-red-700 text-sm font-semibold">🔒 2FA is required</p>
              <p className="text-red-500 text-xs mt-1">
                You must set up two-factor authentication before accessing the system.
              </p>
            </div>
          )}
          {step === 'start' && (
            <div className="text-center">
              <div className="text-5xl mb-4">🔐</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                Set Up Two-Factor Authentication
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                Add an extra layer of security using Google Authenticator or any TOTP app.
              </p>

              <div className="bg-blue-50 rounded-xl p-4 text-left mb-6">
                <p className="text-blue-800 text-sm font-medium mb-2">Before you start:</p>
                <ol className="text-blue-700 text-sm space-y-1 list-decimal list-inside">
                  <li>Install <strong>Google Authenticator</strong> on your phone</li>
                  <li>Or use <strong>Authy</strong> or any TOTP authenticator app</li>
                  <li>Come back here and click Enable 2FA</li>
                </ol>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
                  {error}
                </div>
              )}

              <button
                onClick={handleEnroll}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                {loading ? 'Setting up...' : 'Enable 2FA'}
              </button>
            </div>
          )}

          {/* STEP: Scan QR */}
          {step === 'scan' && (
            <div className="text-center">
              <div className="text-4xl mb-3">📱</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Scan QR Code</h2>
              <p className="text-gray-500 text-sm mb-6">
                Open your authenticator app and scan this QR code
              </p>

              {/* QR Code as image */}
              {qrCodeDataUrl && (
                <div className="flex justify-center mb-4">
                  <div className="bg-white p-3 rounded-xl border-2 border-gray-200 inline-block">
                    <img
                      src={qrCodeDataUrl}
                      alt="2FA QR Code"
                      width={180}
                      height={180}
                    />
                  </div>
                </div>
              )}

              {qrCodeDataUrl && (
  <div className="flex justify-center mb-4">
    <div className="bg-white p-3 rounded-xl border-2 border-gray-200 inline-block">
      <img
        src={qrCodeDataUrl}
        alt="2FA QR Code"
        width={180}
        height={180}
      />
    </div>
  </div>
)}

{/* Mobile warning */}
<div className="bg-yellow-50 rounded-xl p-3 mb-4 text-left">
  <p className="text-yellow-800 text-xs font-medium">
    📱 Using this on your phone?
  </p>
  <p className="text-yellow-700 text-xs mt-1">
    You can't scan the QR code on the same device. 
    Use the <strong>manual code below</strong> instead.
  </p>
</div>

{/* Manual entry - more prominent */}
<div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
  <p className="text-gray-700 text-sm font-medium mb-2">
    🔑 Enter this key manually in your authenticator app:
  </p>
  <div className="bg-white rounded-lg p-3 border border-gray-200 mb-2">
    <p className="text-gray-800 text-sm font-mono break-all select-all text-center tracking-wider">
      {secret}
    </p>
  </div>
  <div className="bg-blue-50 rounded-lg p-3">
    <p className="text-blue-800 text-xs font-medium mb-1">How to enter manually:</p>
    <ol className="text-blue-700 text-xs space-y-1 list-decimal list-inside">
      <li>Open <strong>Google Authenticator</strong></li>
      <li>Tap the <strong>"+"</strong> button</li>
      <li>Choose <strong>"Enter a setup key"</strong></li>
      <li>Enter your email as the account name</li>
      <li>Paste the key above</li>
      <li>Tap <strong>Add</strong></li>
    </ol>
  </div>
</div>

<button
  onClick={() => setStep('verify')}
  className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition"
>
  I've Added It →
</button>
            </div>
          )}

          {/* STEP: Verify */}
          {step === 'verify' && (
            <div className="text-center">
              <div className="text-4xl mb-3">✅</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Verify Setup</h2>
              <p className="text-gray-500 text-sm mb-6">
                Enter the 6-digit code from your authenticator app to confirm
              </p>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleVerify} className="space-y-4">
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  maxLength={6}
                  required
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="000000"
                />
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Confirm & Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep('scan')}
                  className="w-full text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back to QR Code
                </button>
              </form>
            </div>
          )}

          {/* STEP: Done */}
          {step === 'done' && (
            <div className="text-center">
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                2FA is Active!
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                Your account is protected with two-factor authentication.
                You'll need your authenticator app every time you log in.
              </p>

              <div className="bg-green-50 rounded-xl p-4 mb-6 text-left">
                <p className="text-green-800 text-sm">
                  ✅ Next login will ask for your 6-digit code from the authenticator app
                </p>
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition mb-3"
              >
                Back to Dashboard
              </button>

              <button
                onClick={handleUnenroll}
                disabled={loading}
                className="w-full text-sm text-red-400 hover:text-red-600"
              >
                {loading ? 'Removing...' : 'Remove 2FA'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}