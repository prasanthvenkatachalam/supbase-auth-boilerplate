import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { type NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/middleware';

const intlMiddleware = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const intlResponse = intlMiddleware(request);
  
  const response = await createClient(request, intlResponse);
  
  return response;
}

export default proxy;

export const config = {
  matcher: [
    // Next-intl matchers
    '/', 
    '/(en)/:path*', 
    
    // Supabase generic matchers (exclude static assets and API routes)
    '/((?!api|auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
