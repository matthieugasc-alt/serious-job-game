import { registerUser } from "../../../lib/auth";
import { checkRateLimit, getRateLimitId, RATE_LIMITS } from "@/app/lib/rateLimit";
import { parseBody, registerSchema } from "@/app/lib/validation";

export async function POST(req: Request) {
  try {
    // ── Rate limit (by IP, no auth yet) ──
    const rlId = getRateLimitId(req);
    const rl = checkRateLimit(rlId, "auth", RATE_LIMITS.auth);
    if (rl.blocked) return Response.json(rl.body, { status: 429 });

    const body = await req.json();

    // ── Input validation ──
    const parsed = parseBody(body, registerSchema);
    if (parsed.error) return Response.json(parsed.error, { status: 400 });

    const { email, name, password } = parsed.data;
    const result = registerUser(email, name, password);

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json(result, { status: 201 });
  } catch (error: any) {
    console.error("Register error:", error);
    return Response.json(
      { error: error?.message || "Registration failed" },
      { status: 500 }
    );
  }
}
