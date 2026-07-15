# Recovered Pre-Deletion Plans

These are exact, success-gated reconstructions from direct Codex session-tool evidence. They are retained for product history and source recovery; they do not override the active recovery plan or claim that old implementation/verification results remain true in this rebuilt checkout.

- `historical/` — 41 full historical plan files reconstructed with 394 successful direct calls and 407 exact changes, then byte-verified against `historical/ARCHIVE_MANIFEST.json`. The original relative `agent-plans/` names are retained inside this archival directory to avoid replacing the active recovery plans.
- `historical/ARCHIVE_MANIFEST.json` — per-file provenance, direct source events, SHA-256 values, and the 25 historical plan paths that cannot be reconstructed without invention.
- `historical/RECOVERY_REPORT.json` — strict recovery-tool report (`conflict: null`) for the archive extraction.
- `plan-065 shadcn-dark-ui-redesign.predeletion.md` — 166 successful direct historical changes replayed without conflict through the pre-deletion cutoff.
- `plan-066 scanner-cli-operations.predeletion.md` — verified direct Add, 53 lines, SHA-256 `0ad69785441af20275e05d2750e439edd84f86ac105e2e7368a1525f46c141bf`.

`../plan-061 product-coherence.md` was restored at its original path from five success-gated changes; its final SHA-256 is `fb77dbed7b74b8ef1493dd7f4f8178ab10300e41cb7a3d4a87a246e9c9b0a253`.

No historical project `.agent-plans/` entries were found in the canonical source logs. The 25 unrecovered `agent-plans/` paths either lack a successful Add baseline or hit an exact-context replay conflict; they remain deliberately absent.
