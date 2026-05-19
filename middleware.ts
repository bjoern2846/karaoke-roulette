import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Password protection disabled when env var is not set
  if (!process.env.APP_PASSWORD) return NextResponse.next();

  const auth = request.cookies.get("karaoke_auth");
  if (auth?.value === "true") return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Protect everything except: Next.js internals, static assets, login, auth API
    "/((?!_next/static|_next/image|favicon\\.ico|sounds/|login|api/auth|api/logout).*)",
  ],
};
