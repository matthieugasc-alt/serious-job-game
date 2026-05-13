#!/usr/bin/env python3
"""
commitments_store.py — manage open_commitments.json for the
executive-priority-briefing skill (v2).

Stores commitments Matthieu makes in Granola meetings, persists them
across sessions, and supports resolve/abandon/list operations.

Storage path:
    /sessions/*/mnt/serious-job-game/.briefing-state/open_commitments.json

(Falls back to ~/serious-job-game/.briefing-state/ when run on host.)

Usage:
    # Add a new commitment (idempotent on title slug)
    python3 commitments_store.py add --json '{"title":"...","context":"...",...}'

    # List open commitments (sorted oldest first)
    python3 commitments_store.py list [--status open|resolved|abandoned|all]

    # Mark resolved
    python3 commitments_store.py resolve <id> --via {things3|email|user}

    # Mark abandoned
    python3 commitments_store.py abandon <id> --reason "..."

    # Update age_days field on all open items (idempotent)
    python3 commitments_store.py touch

Exit codes:
    0 = success
    1 = invalid args
    2 = id not found
    3 = storage path not accessible
"""

import argparse
import glob
import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime, timezone

SCHEMA_VERSION = 2


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text.lower())
    text = re.sub(r"[-\s]+", "-", text).strip("-")
    return text[:60]


def storage_path() -> str:
    """Resolve the persistent storage path across host / sandbox.

    Order of preference:
    1. Sandbox: /sessions/*/mnt/serious-job-game/.briefing-state/
    2. Host: ~/serious-job-game/.briefing-state/
    """
    # Sandbox mount — check workspace mount first, even if .briefing-state
    # does not exist yet (we will create it).
    workspace_candidates = glob.glob("/sessions/*/mnt/serious-job-game")
    if workspace_candidates:
        d = os.path.join(workspace_candidates[0], ".briefing-state")
    else:
        # Host home fallback
        home = os.path.expanduser("~")
        d = os.path.join(home, "serious-job-game", ".briefing-state")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, "open_commitments.json")


def load() -> dict:
    p = storage_path()
    if not os.path.exists(p):
        return {
            "version": SCHEMA_VERSION,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "commitments": [],
        }
    with open(p) as f:
        data = json.load(f)
    if data.get("version") != SCHEMA_VERSION:
        # Future: migrations
        pass
    return data


def save(data: dict) -> None:
    p = storage_path()
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(p, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def age_days(created_at_iso: str, source: dict | None = None) -> int:
    """Age based on source meeting_date if available, else created_at."""
    ref_iso = None
    if source and source.get("meeting_date"):
        ref_iso = source["meeting_date"]
    else:
        ref_iso = created_at_iso
    try:
        if "T" in ref_iso:
            d = datetime.fromisoformat(ref_iso.replace("Z", "+00:00"))
        else:
            d = datetime.fromisoformat(ref_iso + "T00:00:00+00:00")
    except (ValueError, AttributeError):
        return 0
    delta = datetime.now(timezone.utc) - d.astimezone(timezone.utc)
    return max(delta.days, 0)


def cmd_add(args):
    payload = json.loads(args.json)
    title = payload.get("title")
    if not title:
        print("ERROR: title is required", file=sys.stderr)
        return 1

    data = load()

    # Build id from meeting_date if present, else today
    meeting_date = (payload.get("source") or {}).get("meeting_date") or date.today().isoformat()
    cid = f"cmt_{meeting_date}_{slugify(title)}"

    # Idempotency: if an open commitment with same id or same title slug
    # already exists, update it instead of creating a duplicate.
    existing = None
    for c in data["commitments"]:
        if c["id"] == cid or (
            c["status"] == "open"
            and slugify(c["title"]) == slugify(title)
        ):
            existing = c
            break

    now_iso = datetime.now(timezone.utc).isoformat()

    if existing:
        existing["title"] = title
        if payload.get("context"):
            existing["context"] = payload["context"]
        if payload.get("due_at"):
            existing["due_at"] = payload["due_at"]
        if payload.get("things3_uuid"):
            existing["things3_uuid"] = payload["things3_uuid"]
        if payload.get("things3_url"):
            existing["things3_url"] = payload["things3_url"]
        print(f"UPDATED {existing['id']}")
    else:
        commitment = {
            "id": cid,
            "title": title,
            "owner": "Matthieu",
            "created_at": now_iso,
            "source": payload.get("source") or {"type": "manual"},
            "context": payload.get("context", ""),
            "due_at": payload.get("due_at"),
            "things3_uuid": payload.get("things3_uuid"),
            "things3_url": payload.get("things3_url"),
            "status": "open",
            "resolved_at": None,
            "resolved_via": None,
        }
        data["commitments"].append(commitment)
        print(f"ADDED {cid}")

    save(data)
    return 0


def cmd_list(args):
    data = load()
    items = data["commitments"]
    status = args.status
    if status != "all":
        items = [c for c in items if c["status"] == status]

    # Enrich with computed age
    for c in items:
        c["age_days"] = age_days(c["created_at"], c.get("source"))
    # Sort oldest first
    items.sort(key=lambda c: c["created_at"])

    if args.json:
        print(json.dumps(items, indent=2, ensure_ascii=False))
    else:
        for c in items:
            age = c.get("age_days", 0)
            flag = ""
            if c["status"] == "open":
                if age >= 14:
                    flag = "🔴 ABANDON?"
                elif age >= 8:
                    flag = "🔴"
                elif age >= 4:
                    flag = "⚠"
            print(f"[{c['status']}] J+{age} {flag} {c['id']}")
            print(f"   {c['title']}")
            if c.get("context"):
                print(f"   ctx: {c['context'][:100]}")
            src = c.get("source") or {}
            if src.get("meeting_title"):
                print(f"   from: {src['meeting_title']} ({src.get('meeting_date')})")
            print()
    return 0


def _find(data: dict, cid: str) -> dict | None:
    for c in data["commitments"]:
        if c["id"] == cid:
            return c
    return None


def cmd_resolve(args):
    data = load()
    c = _find(data, args.id)
    if c is None:
        print(f"ERROR: {args.id} not found", file=sys.stderr)
        return 2
    c["status"] = "resolved"
    c["resolved_at"] = datetime.now(timezone.utc).isoformat()
    c["resolved_via"] = args.via
    save(data)
    print(f"RESOLVED {args.id} via {args.via}")
    return 0


def cmd_abandon(args):
    data = load()
    c = _find(data, args.id)
    if c is None:
        print(f"ERROR: {args.id} not found", file=sys.stderr)
        return 2
    c["status"] = "abandoned"
    c["resolved_at"] = datetime.now(timezone.utc).isoformat()
    c["resolved_via"] = f"user:abandoned:{args.reason or 'no reason'}"
    save(data)
    print(f"ABANDONED {args.id}: {args.reason or ''}")
    return 0


def cmd_touch(args):
    data = load()
    for c in data["commitments"]:
        c["age_days"] = age_days(c["created_at"], c.get("source"))
    save(data)
    open_count = sum(1 for c in data["commitments"] if c["status"] == "open")
    print(f"Touched. {open_count} open commitments.")
    return 0


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_add = sub.add_parser("add")
    p_add.add_argument("--json", required=True, help="JSON payload")
    p_add.set_defaults(func=cmd_add)

    p_list = sub.add_parser("list")
    p_list.add_argument("--status", default="open",
                        choices=["open", "resolved", "abandoned", "all"])
    p_list.add_argument("--json", action="store_true")
    p_list.set_defaults(func=cmd_list)

    p_res = sub.add_parser("resolve")
    p_res.add_argument("id")
    p_res.add_argument("--via", required=True,
                       choices=["things3", "email", "user", "auto"])
    p_res.set_defaults(func=cmd_resolve)

    p_aba = sub.add_parser("abandon")
    p_aba.add_argument("id")
    p_aba.add_argument("--reason", default="")
    p_aba.set_defaults(func=cmd_abandon)

    p_touch = sub.add_parser("touch")
    p_touch.set_defaults(func=cmd_touch)

    args = parser.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
