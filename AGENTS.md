# file-census Agent Notes

## Recovery state

The prior checkout was deleted on 2026-07-14. Treat this repository as a clean rebuild: no previous source, checkpoint, test, browser, native, or visual claim is valid until recreated and re-evidenced.

## Plans and queue

- Keep the redesign completion contract in `GOALS.md` and `agent-plans/plan-065 shadcn-dark-ui-redesign.md` current.
- Keep operational CLI/TUI work in `agent-plans/plan-066 scanner-cli-operations.md`.
- `agent-plans/workqueue.yaml` is the coordinator-owned source of task lifecycle truth. Use only `open`, `claimed`, `succeeded`, `failed`, or `abandoned`; derive readiness from succeeded prerequisites.
- Every medium or larger change updates its owning plan with numbered implementation steps, a dated checkbox work log, learning notes, and unfinished work.

## Product invariants

- Rebuild a real application, not a static mock: production state, JSON-RPC, WebSocket/Tauri behavior, file/scan lifecycle, and destructive confirmations must stay truthful.
- The selected scan belongs to exactly one location. The sidebar is global location/scan navigation; the scan workspace is scan-relative.
- Side folder/tree navigation is directories only. Files appear exclusively in the main results workspace, including File tree mode.
- Scan excludes are persistent, non-destructive filters scoped to one scan and apply to every scan-scoped query/action; they never delete indexed records or source bytes.
- Cmd-K lives in the main top bar and dispatches the same real actions/routes as visible controls.
- The visual target is compact shadcn-inspired dark operational UI: near-black neutral surfaces, one-pixel borders, dense controls/tables, no gradients, ornamental cards, or legacy reskin shortcuts.

## Verification and safety

- Use component previews and the in-app browser; capture 1440x900 and 1280x800 screenshots, inspect console logs, and surface screenshots in conversation.
- Do not claim visual acceptance until the user re-supplies the deleted reference/prototype evidence and approves current production screenshots.
- Use only disposable fixture data for destructive-flow tests. Never delete or mutate source files as part of a test.
- Checkpoint stable milestones after reviewing `git diff --check`, focused tests, and relevant build/browser proof.
- Be judicious with disk/RAM: no speculative full builds, massive logs, unbounded fixtures, or cleanup outside explicit user direction.
