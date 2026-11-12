"""Prepare a read-only local baseline for the shared Cloudflare data import."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import build_site
from shared_data import SHARED_FILES, merged_calendar, source_directory
from update_wta_champions import save_history

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "cloudflare" / ".local" / "import-bundle.json"


def fingerprints(sources: list[tuple[str, Path]]) -> list[dict]:
    result = []
    for label, path in sources:
        with path.open("rb") as handle:
            digest = hashlib.file_digest(handle, "sha256").hexdigest()
        result.append({"path": label, "sha256": digest, "bytes": path.stat().st_size})
    return result


def prepare_import(
    output: Path = DEFAULT_OUTPUT,
    *,
    champions_path: Path | None = None,
    calendar_path: Path | None = None,
    now: datetime | None = None,
) -> dict:
    directory = source_directory()
    champions = (champions_path or build_site.CHAMPIONS).resolve()
    calendar = (calendar_path or build_site.CALENDAR).resolve()
    sources = [("shared/" + name, directory / name) for name in SHARED_FILES]
    sources.extend([("haute_cadence/champions", champions), ("haute_cadence/calendar_archive", calendar)])
    output = output.resolve()
    protected = [directory, build_site.ROOT / "data", build_site.DIST]
    if any(output.is_relative_to(path.resolve()) for path in protected) or any(
        output == path.resolve() for _, path in sources
    ):
        raise ValueError("The import output must not overwrite source data or the built website.")

    before = fingerprints(sources)
    stamp = now or datetime.now(UTC)
    if stamp.tzinfo is None or stamp.utcoffset() is None:
        raise ValueError("The preparation timestamp must include a timezone.")
    payload = {
        "schema_version": 1,
        "prepared_at": stamp.astimezone(UTC).isoformat(),
        "players": build_site.build_player_payload(champions),
        "calendar": merged_calendar(calendar),
        "champions": json.loads(champions.read_text(encoding="utf-8")),
        "sources": before,
    }
    if fingerprints(sources) != before:
        raise ValueError("Source data changed while preparing the import; retry with a stable source snapshot.")
    save_history(output, payload)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--champions", type=Path, help="Use a separately staged saved champion history.")
    parser.add_argument("--calendar", type=Path, help="Use a separately staged accumulated calendar.")
    args = parser.parse_args()
    try:
        payload = prepare_import(args.output, champions_path=args.champions, calendar_path=args.calendar)
    except (OSError, ValueError) as exc:
        parser.exit(1, str(exc) + "\n")
    print(f"Prepared {len(payload['players']['players']):,} players and "
          f"{len(payload['champions']['champions']):,} champions in {args.output}")


if __name__ == "__main__":
    main()
