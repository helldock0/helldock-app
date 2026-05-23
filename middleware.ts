import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — MUST be called before any auth checks
  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  const isAuthPath =
    path.startsWith('/login') ||
    path.startsWith('/auth') ||
    path.startsWith('/signup') ||
    path.startsWith('/invite') ||
    path.startsWith('/onboarding') ||
    path.startsWith('/suspended')

  // / and /pro-scout are public marketing surfaces — anyone reads.
  const isPublicMarketing = path === '/' || path.startsWith('/pro-scout')

  // Authenticated visitors hitting the bare `/` get sent to their app dashboard.
  if (user && path === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return redirectWithCookies(url, supabaseResponse)
  }

  // Unauth → redirect to login (except auth + public marketing paths).
  if (!user && !isAuthPath && !isPublicMarketing) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return redirectWithCookies(url, supabaseResponse)
  }

  // Authed + on /login → bounce to /app
  if (user && path.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return redirectWithCookies(url, supabaseResponse)
  }

  return supabaseResponse
}

/**
 * Build a redirect response that preserves any cookies Supabase may have
 * refreshed onto `supabaseResponse`. Without this, refreshed access/refresh
 * tokens are dropped on every middleware redirect — and because Supabase
 * rotates refresh tokens on each refresh, the old token is already
 * invalidated by the time the next request hits, so the user appears logged
 * out one navigation later.
 */
function redirectWithCookies(url: URL, supabaseResponse: NextResponse): NextResponse {
  const res = NextResponse.redirect(url)
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    res.cookies.set(cookie.name, cookie.value, cookie)
  })
  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
