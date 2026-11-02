import { NextResponse, type NextRequest } from 'next/server';

const ADMIN_PROTECTED = /^\/admin(?!\/setup|\/login)/;
const API_ADMIN_PROTECTED = /^\/api\/admin(?!\/setup|\/login)/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminPage = ADMIN_PROTECTED.test(pathname);
  const isAdminApi = API_ADMIN_PROTECTED.test(pathname);
  if (!isAdminPage && !isAdminApi) return NextResponse.next();

  // Iron-session cookie presence check; signature/decryption happens in route handlers.
  const session = req.cookies.get('hei_gallery_session');
  if (!session) {
    if (isAdminApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
