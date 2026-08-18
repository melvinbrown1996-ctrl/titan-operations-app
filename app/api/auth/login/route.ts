import { createStaffSession, SESSION_COOKIE } from "../../../chatgpt-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
    const session = await createStaffSession(body?.email ?? "", body?.password ?? "");
    if (!session) return Response.json({ error: "That email or password is not recognized." }, { status: 401 });
    const response = Response.json({ member: session.member });
    response.headers.set("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(session.token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
    return response;
  } catch (error) {
    console.error("Titan staff sign-in error", error);
    return Response.json({ error: "Sign-in is temporarily unavailable." }, { status: 500 });
  }
}
