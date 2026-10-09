import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = new Set(['/login', '/register/patient', '/forgot-password', '/reset-password']);

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.has(pathname) || pathname.startsWith('/api/auth/');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const response = NextResponse.next({ request });
    if (isPublic) return response;

    return new NextResponse(
      `<!doctype html><html><head><title>CareMesh configuration required</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Inter,Arial,sans-serif;background:#f4f7fb;color:#10233f;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}.card{max-width:760px;background:#fff;border:1px solid #dfe7f0;border-radius:20px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.08)}h1{margin:0 0 12px;font-size:26px}p{color:#66778c;line-height:1.6}code{display:block;background:#f3f6fa;border-radius:10px;padding:14px;line-height:1.8;overflow:auto}strong{color:#10233f}</style></head><body><div class="card"><h1>CareMesh environment is not configured</h1><p>Create <strong>.env.local</strong> in the project root and add the Supabase project URL and publishable key. Keep the service-role key and Gemini key server-side only.</p><code>NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co<br>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx<br>SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx<br>GEMINI_API_KEY=AIza...</code><p>After saving the file, stop and restart <strong>npm run dev</strong>.</p></div></body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  const protectedArea = pathname.startsWith('/admin') || pathname.startsWith('/patient');
  const authPages = PUBLIC_PATHS.has(pathname);

  if (protectedArea && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (authPages && user && !pathname.startsWith('/reset-password')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)'],
};
