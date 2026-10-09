import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function getRequiredEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing. Create .env.local from .env.example and restart Next.js.`);
  }
  return value;
}

export async function createClient() {
  const cookieStore = await cookies();
  const supabaseUrl = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseKey = getRequiredEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot always mutate cookies. proxy.ts refreshes sessions.
        }
      },
    },
  });
}
