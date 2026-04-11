import { registerUser } from "../../../lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { email, name, password } = body;

    if (!email || !name || !password) {
      return Response.json(
        { error: "Missing required fields: email, name, password" },
        { status: 400 }
      );
    }

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
