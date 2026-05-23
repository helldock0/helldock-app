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
    path.startsWith('/onboarding')

  // / and /pro-scout are public marketing surfaces — anyone reads.
  const isPublicMarketing = path === '/' || path.startsWith('/pro-scout')

  // Authenticated visitors hitting the bare `/` get sent to their app dashboard.
  if (user && path === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return NextResponse.redirect(url)
  }

  // Unauth → redirect to login (except auth + public marketing paths).
  if (!user && !isAuthPath && !isPublicMarketing) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authed + on /login → bounce to /app
  if (user && path.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
