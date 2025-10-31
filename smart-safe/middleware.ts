import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "./lib/auth";

export function middleware(request: NextRequest) {
  // Only protect admin routes, but exclude login page
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = request.cookies.get("auth-token")?.value;

    if (!token) {
      // return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    const payload = verifyToken(token);
    if (!payload || !payload.isAdmin) {
      // return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
  // Exclude /admin/login from middleware
};
