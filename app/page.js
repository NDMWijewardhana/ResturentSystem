'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('login') // 'login' | '2fa' | 'setup-prompt'
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Check if user has 2FA enabled
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const verifiedFactors = factors?.totp?.filter(f => f.status === 'verified')

    if (verifiedFactors?.length > 0) {
      // Has 2FA — go to verify step
      setStep('2fa')
    } else {
      // No 2FA set up yet — prompt them to set it up
      setStep('setup-prompt')
    }

    setLoading(false)
  }

  async function handleVerify2FA(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: factors } = await supabase.auth.mfa.listFactors()
    const verifiedFactors = factors?.totp?.filter(f => f.status === 'verified')
    const factorId = verifiedFactors[0].id

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

    router.push('/dashboard')
    setLoading(false)
  }

  async function handleSkip2FA() {
    // Allow login but redirect to setup page
    router.push('/setup-2fa')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setStep('login')
    setEmail('')
    setPassword('')
    setOtp('')
    setError('')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-8">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🍽️</div>
          <h1 className="text-2xl font-bold text-gray-800">Restaurant System</h1>
          <p className="text-gray-500 text-sm mt-1">
            {step === 'login' && 'Sign in to your account'}
            {step === '2fa' && 'Two-Factor Authentication'}
            {step === 'setup-prompt' && 'Secure Your Account'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* STEP 1 — Login form */}
        {step === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* STEP 2 — 2FA verify */}
        {step === '2fa' && (
          <form onSubmit={handleVerify2FA} className="space-y-4">
            <div className="bg-blue-50 rounded-xl p-4 text-center mb-2">
              <p className="text-blue-800 text-sm">
                Open your <strong>Authenticator app</strong> and enter the 6-digit code
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                6-digit code
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                maxLength={6}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="000000"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
            >
              ← Back to Login
            </button>
          </form>
        )}

        {/* STEP 3 — Prompt to set up 2FA */}
        {step === 'setup-prompt' && (
          <div className="space-y-4">
            <div className="bg-yellow-50 rounded-xl p-4 text-center">
              <div className="text-3xl mb-2">🔐</div>
              <p className="text-yellow-800 text-sm font-medium">
                Your account is not protected with 2FA yet
              </p>
              <p className="text-yellow-700 text-xs mt-1">
                We strongly recommend setting up two-factor authentication to keep your account secure.
              </p>
            </div>

            <button
              onClick={() => router.push('/setup-2fa')}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              🔐 Set Up 2FA Now (Recommended)
            </button>

            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-gray-100 text-gray-600 py-3 rounded-lg font-medium hover:bg-gray-200 transition text-sm"
            >
              Skip for now →
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-sm text-gray-400 hover:text-gray-600 py-1"
            >
              ← Back to Login
            </button>
          </div>
        )}

      </div>
    </div>
  )
}