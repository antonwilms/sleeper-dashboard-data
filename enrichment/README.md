# Enrichment overlay

This directory holds hand-curated data that no API provides — coaching staffs,
scheme notes, injury type/severity for known absence segments, and free-form
player/team notes.

**Always use the CLI to add or remove entries.**  Direct JSON edits bypass
validation and can produce broken state.  After a manual typo fix, run
`node bin/enrich.mjs validate` to re-check.

---

## Files

| File | Contents |
|------|----------|
| `coaching.json` | One entry per (team, year, role). Roles: HC, OC, DC. |
| `scheme.json`   | One entry per (team, year). Offensive/defensive philosophy. |
| `injuries.json` | One entry per known injury event, tied to an absence segment in `nfl/season-totals/`. |
| `notes.json`    | Free-form notes scoped to a player_id or team, with optional year. |

---

## Adding entries

```bash
# Coaching staff
node bin/enrich.mjs coaching add --year 2025 --team SF --role HC --name "Kyle Shanahan"

# Scheme
node bin/enrich.mjs scheme add --year 2024 --team MIA --offense "wide zone / play-action"

# Injury (segment-start must exist in nfl/season-totals/<year>.json for that player)
node bin/enrich.mjs injuries add --player 6803 --year 2023 --segment-start 2 \
    --type ACL --body-part knee --severity season-ending --date-injured 2023-09-11

# Player note
node bin/enrich.mjs notes add --player 4034 --year 2024 \
    --body "Slot-heavy in 11-personnel through Week 6." --tag usage

# Team note
node bin/enrich.mjs notes add --team SF --year 2025 --body "Run-heavy after bye week." --tag scheme
```

---

## Maintenance

```bash
node bin/enrich.mjs validate              # validate all four files
node bin/enrich.mjs list injuries         # list all injury entries
node bin/enrich.mjs list coaching --year 2025
node bin/enrich.mjs remove <id>           # remove by id (any file)
```

---

## Orphaned entries

If `nfl/season-totals/<year>.json` is regenerated and absence segments shift,
an injury entry's `segmentStartWeek` may no longer match any segment.  The app
silently ignores orphaned entries; `node bin/enrich.mjs validate` will flag them
on the next run.

---

See `../README.md` → "Enrichment overlay" for full schema documentation and
decision rationale.
