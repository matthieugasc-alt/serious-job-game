import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Download API — serves scenario document files.
// Supports two file_path formats:
//  1. Absolute from public root (classic): "/scenarios/heritage/file.pdf"
//  2. Relative to scenario dir (Founder): "documents/file.md"
// Optional ?scenarioId= param narrows the search for case 2.
export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file");
  if (!file) {
    return NextResponse.json({ error: "Missing file parameter" }, { status: 400 });
  }

  const scenarioIdParam = req.nextUrl.searchParams.get("scenarioId");
  let resolvedPath: string | null = null;

  // ── Strategy 1: classic path (absolute from public root) ──
  const publicPath = path.resolve(path.join(process.cwd(), "public", file));
  const publicScenariosRoot = path.resolve(
    path.join(process.cwd(), "public", "scenarios")
  );

  if (publicPath.startsWith(publicScenariosRoot) && fs.existsSync(publicPath)) {
    resolvedPath = publicPath;
  }

  // ── Strategy 2: Founder scenarios (relative path like "documents/xxx.md") ──
  if (!resolvedPath) {
    const scenariosRoot = path.resolve(path.join(process.cwd(), "scenarios"));

    if (scenarioIdParam) {
      // If scenarioId is provided, look directly in that scenario dir
      const candidate = path.resolve(
        path.join(scenariosRoot, scenarioIdParam, file)
      );
      if (candidate.startsWith(scenariosRoot) && fs.existsSync(candidate)) {
        resolvedPath = candidate;
      }
    } else {
      // Search across all scenario directories
      try {
        const scenarioDirs = fs
          .readdirSync(scenariosRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory());

        for (const dir of scenarioDirs) {
          const candidate = path.resolve(
            path.join(scenariosRoot, dir.name, file)
          );
          // Security: must stay within scenarios root
          if (candidate.startsWith(scenariosRoot) && fs.existsSync(candidate)) {
            resolvedPath = candidate;
            break;
          }
        }
      } catch {
        // scenarios/ dir doesn't exist — fall through to 404
      }
    }
  }

  if (!resolvedPath) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(resolvedPath);
  const filename = path.basename(resolvedPath);
  const ext = path.extname(resolvedPath).toLowerCase();

  const mimeTypes: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
  };

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
