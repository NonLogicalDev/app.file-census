# File Census Rebuild Goals

## Recovery status

On 2026-07-14 the prior repository, Git history, plans, source, and generated assets were deleted during disk cleanup. Structured historical session logs survive and are being replayed only when their context can be validated exactly. A 109-event provenance index plus complete direct-read seeds now produces hash-verified source paths; a final-architecture baseline has been promoted into this checkout after static React import and Rust module checks. The global stylesheet has been recovered through a clean 2026-07-12 horizon, and the later June 14 App source is now restored byte-for-byte with a 47-file relative-import closure. Exact root `flake.nix` and `.gitignore` have been restored, while `flake.lock` remains intentionally absent because only its generation/staging—not full content—was evidenced. A 41-file historical plan archive, including per-file direct-event provenance and SHA-256 checks, is restored under `agent-plans/recovered/historical/`; no original `.agent-plans/` project entries exist in the evidence. A read-only closure audit confirms that source imports are complete but the checkout has no Node/Rust toolchain or lockfiles, no `ui/dist`, and no configured native PNG/ICNS icons; builds must remain gated until those inputs are deliberately restored. Every patch is gated by matching direct success output, so failed historical calls are excluded. Formatter-conflicted backend revisions and native bundle assets remain unresolved, so the checkout is not yet accepted as runnable and every historic implementation/verification claim remains reset.

## Completion contract

- [ ] Rebuild the approved shadcn-inspired dark production UI with real application behavior—not a mock or a reskin.
- [ ] Recover all deterministically replayable source from session logs without fuzzy patches, copied-context duplicates, or post-deletion events; rebuild only the unrecoverable remainder.
- [ ] Match the recovered/re-supplied visual reference at 1440x900 and 1280x800: compact near-black surfaces, restrained one-pixel borders, dense operational layout, sparse semantic color, no gradients or ornamental cards.
- [ ] Preserve real application state, JSON-RPC, WebSocket/Tauri transport, backend behavior, routing, destructive confirmations, and file workflows.
- [ ] Rebuild the collapsible/resizable sidebar, main-top-bar Cmd-K, Locations/Scan Browser, Files/File tree, Duplicates, Tasks, Search, Options, and safe file actions.
- [ ] Enforce directory-only scan navigation; files render only in the main results workspace.
- [ ] Implement persistent, non-destructive per-scan excludes for every scan-scoped query and action, with source/index integrity proof.
- [ ] Add the compatible CLI scan shorthand: database location + source path + volume slug bootstrap missing location/scan records without altering existing command behavior.
- [ ] Add an opt-in Ratatui progress workflow with truthful queue/pool bars and oldest-first active operations, safe terminal restoration, and non-TTY fallback.
- [ ] Maintain synchronized plans and `agent-plans/workqueue.yaml`; checkpoint stable milestones.
- [ ] Complete automated, browser-server, native/Tauri, accessibility, destructive-fixture, and design-QA evidence with no unresolved P0/P1/P2 issues.
- [ ] Receive explicit user approval of final production screenshots and behavior.

## Missing acceptance input

- [ ] User re-supplies `shadcn-dark-reference.jpg` and the approved prototype baseline/screenshots, which were deleted with the repository. Do not invent visual acceptance evidence without them.
