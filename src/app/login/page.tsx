'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
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

    if (error) {
      setError(error.message)
    } else {
      setSubmitted(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-[#FFD700] tracking-tight mb-1">
          HELLDOCK
        </h1>
        <p className="text-[#6B7280] text-sm mb-8">valorant analytics · private</p>

        {submitted ? (
          <div className="bg-[#2C2C32] rounded-xl p-6">
            <p className="text-white font-medium mb-1">check your inbox</p>
            <p className="text-[#6B7280] text-sm">
              magic link sent to{' '}
              <span className="text-[#FFD700]">{email}</span>
            </p>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="bg-[#2C2C32] rounded-xl p-6 flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="block text-sm text-[#6B7280] mb-1.5">
                email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#1B1B1F] border border-[#3C3C44] rounded-lg px-3 py-2 text-white placeholder-[#4B5563] focus:outline-none focus:border-[#FFD700] transition-colors text-sm"
              />
            </div>

            {error && (
              <p className="text-[#DC143C] text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-[#FFD700] text-[#1B1B1F] font-semibold rounded-lg py-2 px-4 hover:bg-yellow-300 disabled:opacity-50 transition-colors text-sm"
            >
              {loading ? 'sending…' : 'send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
