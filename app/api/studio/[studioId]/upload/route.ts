/**
 * /api/studio/[studioId]/upload — Upload assets (PDFs, images)
 *
 * POST: Accept multipart form data with file upload
 *       Saves to both public/scenarios/ and data/studio/assets/
 */

export const runtime = "nodejs";

import {
  mkdirSync,
  writeFileSync,
  existsSync,
} from "fs";
import { join } from "path";

const ALLOWED_EXTENSIONS = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
];

/**
 * Sanitize filename
 */
function sanitizeFilename(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_");
}

/**
 * Get file extension
 */
function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

/**
 * POST /api/studio/[studioId]/upload
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ studioId: string }> }
) {
  const { studioId } = await params;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return Response.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file
    const extension = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return Response.json(
        {
          error: `File type not allowed. Supported types: ${ALLOWED_EXTENSIONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Sanitize filename
    const sanitizedFilename = sanitizeFilename(file.name);

    // Create directories
    const publicDir = join(
      process.cwd(),
      "public",
      "scenarios",
      studioId
    );
    mkdirSync(publicDir, { recursive: true });

    const assetsDir = join(
      process.cwd(),
      "data",
      "studio",
      studioId,
      "assets"
    );
    mkdirSync(assetsDir, { recursive: true });

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Write to both locations
    const publicPath = join(publicDir, sanitizedFilename);
    const assetsPath = join(assetsDir, sanitizedFilename);

    writeFileSync(publicPath, buffer);
    writeFileSync(assetsPath, buffer);

    return Response.json(
      {
        success: true,
        fileName: sanitizedFilename,
        filePath: `/scenarios/${studioId}/${sanitizedFilename}`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error(`Error uploading file for studio ${studioId}:`, error);
    return Response.json(
      { error: error?.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}
