import { currentMember } from "../../../lib/member-role";
export async function GET() { try { const member = await currentMember(); return Response.json({ member }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Sign in is required." }, { status: 401 }); } }
