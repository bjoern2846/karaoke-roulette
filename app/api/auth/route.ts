import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password } = (await request.json()) as { password: string };

  const expected = process.env.APP_PASSWORD;

  // If no password configured, always allow
  if (!expected || password === expected) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set("karaoke_auth", "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return response;
  }

  return NextResponse.json({ error: "Falsches Passwort." }, { status: 401 });
}
