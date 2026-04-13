# Scenario Studio API Routes

## Overview

The Scenario Studio API provides endpoints for managing editorial scenario data, compiling it to runtime format, validating, and uploading assets. All routes use Next.js 16 App Router with Promise-based params.

### Base URL
```
/api/studio
```

### Configuration
All routes include:
```typescript
export const runtime = "nodejs";
```

This enables file system access for reading/writing scenario data.

---

## Endpoints

### 1. List Studio Scenarios

**Endpoint:** `GET /api/studio`

**Description:** Lists all studio scenarios from the `data/studio/` directory.

**Response:**
```json
{
  "scenarios": [
    {
      "id": "scenario-id",
      "title": "Scenario Title",
      "status": "draft",
      "updatedAt": "2025-04-13T10:30:00Z"
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `500` - Server error

**Notes:**
- Returns scenarios sorted by `updatedAt` (newest first)
- Creates `data/studio/` directory if it doesn't exist
- Skips invalid/malformed scenario files

---

### 2. Create Studio Scenario

**Endpoint:** `POST /api/studio`

**Description:** Creates a new studio scenario with directory structure and default values.

**Request Body:**
```json
{
  "title": "My Scenario",
  "tags": ["optional", "tags"]
}
```

**Response:**
```json
{
  "success": true,
  "scenario": {
    "id": "my-scenario",
    "title": "My Scenario",
    "subtitle": "",
    "description": "",
    "difficulty": "junior",
    "durationMin": 30,
    "locale": "fr-FR",
    "status": "draft",
    "adminLocked": true,
    "createdAt": "2025-04-13T10:30:00Z",
    "updatedAt": "2025-04-13T10:30:00Z",
    ...
  }
}
```

**Directory Structure Created:**
```
data/studio/{kebab-id}/
├── studio.json          (editorial data with defaults)
├── assets/              (empty - for uploaded files)
└── prompts/             (empty - for AI prompt files)
```

**Status Codes:**
- `201` - Scenario created
- `400` - Missing or invalid title
- `500` - Server error

**Default Values:**
- `difficulty`: "junior"
- `durationMin`: 30
- `locale`: "fr-FR"
- `simSpeedMultiplier`: 1
- `status`: "draft"
- `adminLocked`: true
- All arrays initialized as empty: `tags`, `pedagogicalGoals`, `competencies`, `introCards`, `actors`, `channels`, `phases`, `documents`, `endings`

---

### 3. Get Studio Scenario

**Endpoint:** `GET /api/studio/[studioId]`

**Description:** Reads and returns the complete `studio.json` for a specific scenario.

**Parameters:**
- `studioId` (path parameter) - Scenario ID (kebab-case)

**Response:**
Returns the complete studio scenario object as defined in `studio.json`.

**Status Codes:**
- `200` - Success
- `404` - Studio scenario not found
- `500` - Server error

---

### 4. Update Studio Scenario

**Endpoint:** `PUT /api/studio/[studioId]`

**Description:** Updates the studio scenario with new data. Supports partial updates (only changed fields).

**Parameters:**
- `studioId` (path parameter) - Scenario ID

**Request Body:**
```json
{
  "title": "Updated Title",
  "description": "New description",
  "difficulty": "medium",
  ...
}
```

**Response:**
Returns the updated scenario object.

**Behavior:**
- Preserves the scenario ID
- Automatically sets `updatedAt` to current timestamp
- Merges provided data with existing scenario (partial updates supported)

**Status Codes:**
- `200` - Success
- `400` - Invalid body (not an object)
- `404` - Studio scenario not found
- `500` - Server error

---

### 5. Delete Studio Scenario

**Endpoint:** `DELETE /api/studio/[studioId]`

**Description:** Permanently deletes the studio scenario folder and all contents.

**Parameters:**
- `studioId` (path parameter) - Scenario ID

**Response:**
```json
{
  "success": true,
  "message": "Studio scenario \"my-scenario\" deleted"
}
```

**Status Codes:**
- `200` - Success
- `404` - Studio scenario not found
- `500` - Server error

---

### 6. Compile Scenario

**Endpoint:** `POST /api/studio/[studioId]/compile`

**Description:** Compiles editorial data to runtime JSON format, validates, and writes to `scenarios/` directory.

**Parameters:**
- `studioId` (path parameter) - Scenario ID

**Request Body:**
Empty - uses `studio.json` from disk

**Response on Success:**
```json
{
  "success": true,
  "compiled": {
    "scenario_id": "my-scenario",
    "version": "1.0.0",
    "locale": "fr-FR",
    "meta": {...},
    "narrative": {...},
    "timeline": {...},
    "introduction": {...},
    "actors": [...],
    "channels": [...],
    "resources": {...},
    "constraints": {},
    "state": {...},
    "initial_events": [...],
    "phases": [...],
    "endings": [...],
    "default_ending": {...}
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}
```

**Response on Validation Error:**
```json
{
  "success": false,
  "validation": {
    "valid": false,
    "errors": ["Error message 1", "Error message 2"],
    "warnings": []
  }
}
```

**Files Created/Written:**
```
scenarios/{studioId}/
├── scenario.json        (compiled runtime definition)
└── prompts/             (copied from data/studio/[studioId]/prompts/)
```

**Process:**
1. Reads `data/studio/{studioId}/studio.json`
2. Calls `compileScenario()` to transform editorial to runtime format
3. Calls `validateScenario()` to verify compiled output
4. If valid: writes `scenarios/{studioId}/scenario.json` and copies prompt files
5. If invalid: returns validation errors without writing

**Status Codes:**
- `200` - Success (compilation and validation passed)
- `400` - Compilation or validation failed
- `404` - Studio scenario not found
- `500` - Server error

---

### 7. Upload Asset

**Endpoint:** `POST /api/studio/[studioId]/upload`

**Description:** Uploads files (PDFs, images) as multipart form data.

**Parameters:**
- `studioId` (path parameter) - Scenario ID

**Request:**
```
Content-Type: multipart/form-data

Field name: "file"
File: <binary data>
```

**Response:**
```json
{
  "success": true,
  "fileName": "document.pdf",
  "filePath": "/scenarios/my-scenario/document.pdf"
}
```

**Allowed File Types:**
- Documents: `pdf`
- Images: `jpg`, `jpeg`, `png`, `gif`, `webp`, `svg`

**File Processing:**
1. Validates file extension
2. Sanitizes filename (lowercase, alphanumeric + underscore/hyphen/dot)
3. Saves to TWO locations:
   - `public/scenarios/{studioId}/{filename}` (public web access)
   - `data/studio/{studioId}/assets/{filename}` (editorial storage)

**Status Codes:**
- `200` - File uploaded successfully
- `400` - No file provided or invalid file type
- `500` - Server error

**Notes:**
- Double underscores in filenames are collapsed to single underscore
- Files are accessible via `filePath` URL immediately after upload

---

### 8. Validate Scenario

**Endpoint:** `POST /api/studio/[studioId]/validate`

**Description:** Validates scenario without writing files to disk. Useful for pre-compile checking.

**Parameters:**
- `studioId` (path parameter) - Scenario ID

**Request Body:**
Empty - uses `studio.json` from disk

**Response on Valid:**
```json
{
  "valid": true,
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}
```

**Response on Invalid:**
```json
{
  "valid": false,
  "validation": {
    "valid": false,
    "errors": [
      "Missing required field: title",
      "Phase references unknown actor_id: unknown_actor"
    ],
    "warnings": [
      "Phase phase1 references unknown next_phase: unknown_phase"
    ]
  }
}
```

**Process:**
1. Reads `studio.json`
2. Compiles to runtime format
3. Validates without writing files
4. Returns detailed validation results

**Status Codes:**
- `200` - Validation completed (check `valid` flag for result)
- `400` - Validation failed with errors
- `404` - Studio scenario not found
- `500` - Server error

---

## Data Structure

### Studio Scenario Template

Each scenario is stored as `data/studio/{studioId}/studio.json`:

```json
{
  "id": "my-scenario",
  "title": "Scenario Title",
  "subtitle": "",
  "description": "",
  "jobFamily": "",
  "difficulty": "junior",
  "durationMin": 30,
  "tags": [],
  "locale": "fr-FR",
  "context": "",
  "mission": "",
  "initialSituation": "",
  "trigger": "",
  "backgroundFact": "",
  "scenarioStart": "2025-04-13T10:30:00Z",
  "simSpeedMultiplier": 1,
  "pedagogicalGoals": [],
  "competencies": [],
  "introCards": [],
  "actors": [],
  "channels": [],
  "phases": [],
  "documents": [],
  "endings": [],
  "defaultEndingId": "",
  "status": "draft",
  "adminLocked": true,
  "createdAt": "2025-04-13T10:30:00Z",
  "updatedAt": "2025-04-13T10:30:00Z"
}
```

---

## File System Layout

```
project-root/
├── data/
│   └── studio/
│       └── {studioId}/
│           ├── studio.json          (editorial data)
│           ├── assets/              (uploaded files)
│           └── prompts/             (AI prompt files)
├── scenarios/
│   └── {studioId}/
│       ├── scenario.json            (compiled runtime definition)
│       └── prompts/                 (copied from studio/prompts/)
├── public/
│   └── scenarios/
│       └── {studioId}/              (publicly accessible uploads)
└── app/
    └── api/
        └── studio/
            ├── route.ts             (GET/POST /api/studio)
            └── [studioId]/
                ├── route.ts         (GET/PUT/DELETE)
                ├── compile/
                │   └── route.ts     (POST compile)
                ├── upload/
                │   └── route.ts     (POST upload)
                └── validate/
                    └── route.ts     (POST validate)
```

---

## Implementation Notes

### ID Generation
Titles are converted to kebab-case IDs:
- Lowercase conversion
- Non-alphanumeric characters replaced with hyphens
- Trimmed of leading/trailing hyphens

Example: `"My Awesome Scenario"` → `"my-awesome-scenario"`

### Timestamps
All timestamps use ISO 8601 format:
```typescript
new Date().toISOString()  // "2025-04-13T10:30:00.000Z"
```

### Error Handling
All routes:
- Return proper JSON responses
- Include descriptive error messages
- Log errors to console for debugging
- Handle edge cases (missing files, invalid JSON, etc.)

### File Operations
- Uses named imports from `fs` and `path` modules
- Creates directories with `{ recursive: true }` option
- Handles both sync and async file operations appropriately

### Compilation & Validation
- Delegates to `compileScenario()` and `validateScenario()` functions from `@/app/lib/studioCompiler`
- Validates required fields and cross-references (actor IDs, channel IDs, etc.)
- Provides detailed error and warning messages
- Automatically generates missing prompt file references

---

## Usage Examples

### Create a New Scenario
```bash
curl -X POST http://localhost:3000/api/studio \
  -H "Content-Type: application/json" \
  -d '{"title": "Customer Service Challenge", "tags": ["customer-service", "communication"]}'
```

### Update a Scenario
```bash
curl -X PUT http://localhost:3000/api/studio/customer-service-challenge \
  -H "Content-Type: application/json" \
  -d '{"description": "Handle customer complaints effectively", "difficulty": "medium"}'
```

### Upload an Asset
```bash
curl -X POST http://localhost:3000/api/studio/customer-service-challenge/upload \
  -F "file=@contract.pdf"
```

### Compile a Scenario
```bash
curl -X POST http://localhost:3000/api/studio/customer-service-challenge/compile
```

### Validate a Scenario
```bash
curl -X POST http://localhost:3000/api/studio/customer-service-challenge/validate
```

### Delete a Scenario
```bash
curl -X DELETE http://localhost:3000/api/studio/customer-service-challenge
```

