import { loginUser } from "../../../lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { email, password } = body;

    if (!email || !password) {
      return Response.json(
        { error: "Missing required fields: email, password" },
        { status: 400 }
      );
    }

    const result = loginUser(email, password);

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: 401 });
    }

    return Response.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Login error:", error);
    return Response.json(
      { error: error?.message || "Login failed" },
      { status: 500 }
    );
  }
}
