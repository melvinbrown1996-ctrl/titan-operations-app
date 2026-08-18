import { clearStaffSession, SESSION_COOKIE } from "../../../chatgpt-auth";

function sessionFromRequest(request: Request) {
  const value = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  return value ? decodeURIComponent(value.slice(SESSION_COOKIE.length + 1)) : null;
}

export async function POST(request: Request) {
  await clearStaffSession(sessionFromRequest(request));
  const response = Response.json({ ok: true });
  response.headers.set("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return response;
}
