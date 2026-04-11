import { validateSession } from "../../../lib/auth";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return Response.json(
        { error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return Response.json(
        { error: "Invalid Authorization header format" },
        { status: 401 }
      );
    }

    const token = parts[1];

    const result = validateSession(token);

    if (!result) {
      return Response.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    return Response.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Session validation error:", error);
    return Response.json(
      { error: error?.message || "Session validation failed" },
      { status: 500 }
    );
  }
}
