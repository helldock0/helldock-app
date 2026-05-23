'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'password' | 'magic'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) setError(error.message)
    else setSubmitted(true)
    setLoading(false)
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Clear team cookie so the per-session picker is enforced.
    // (auth/callback does this for magic link; we replicate here.)
    document.cookie = 'helldock_team=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'

    // Refresh server-side state then navigate.
    router.push('/app/select-team')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-[#FFD700] tracking-tight mb-1">HELLDOCK</h1>
        <p className="text-[#6B7280] text-sm mb-8">valorant analytics</p>

        {submitted ? (
          <div className="bg-[#2C2C32] rounded-xl p-6">
            <p className="text-white font-medium mb-1">check your inbox</p>
            <p className="text-[#6B7280] text-sm">
              magic link sent to <span className="text-[#FFD700]">{email}</span>
            </p>
            <button
              type="button"
              onClick={() => { setSubmitted(false); setEmail('') }}
              className="text-[#6B7280] text-xs mt-4 hover:text-white"
            >
              use a different email →
            </button>
          </div>
        ) : (
          <div className="bg-[#2C2C32] rounded-xl overflow-hidden">
            <div className="flex border-b border-[#3C3C44]">
              <button
                type="button"
                onClick={() => { setMode('password'); setError(null) }}
                className={`flex-1 px-4 py-2.5 text-sm transition-colors ${
                  mode === 'password'
                    ? 'bg-[#1B1B1F] text-[#FFD700] font-semibold'
                    : 'text-[#6B7280] hover:text-white'
                }`}
              >
                password
              </button>
              <button
                type="button"
                onClick={() => { setMode('magic'); setError(null) }}
                className={`flex-1 px-4 py-2.5 text-sm transition-colors ${
                  mode === 'magic'
                    ? 'bg-[#1B1B1F] text-[#FFD700] font-semibold'
                    : 'text-[#6B7280] hover:text-white'
                }`}
              >
                magic link
              </button>
            </div>

            <form
              onSubmit={mode === 'password' ? handlePassword : handleMagicLink}
              className="p-6 flex flex-col gap-4"
            >
              <div>
                <label htmlFor="email" className="block text-sm text-[#6B7280] mb-1.5">
                  email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-[#1B1B1F] border border-[#3C3C44] rounded-lg px-3 py-2 text-white placeholder-[#4B5563] focus:outline-none focus:border-[#FFD700] transition-colors text-sm"
                />
              </div>

              {mode === 'password' && (
                <div>
                  <label htmlFor="password" className="block text-sm text-[#6B7280] mb-1.5">
                    password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#1B1B1F] border border-[#3C3C44] rounded-lg px-3 py-2 text-white placeholder-[#4B5563] focus:outline-none focus:border-[#FFD700] transition-colors text-sm"
                  />
                </div>
              )}

              {error && <p className="text-[#DC143C] text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="bg-[#FFD700] text-[#1B1B1F] font-semibold rounded-lg py-2 px-4 hover:bg-yellow-300 disabled:opacity-50 transition-colors text-sm"
              >
                {loading
                  ? (mode === 'password' ? 'signing in…' : 'sending…')
                  : (mode === 'password' ? 'sign in' : 'send magic link')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
