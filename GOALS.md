# File Census Rebuild Goals

## Recovery status

On 2026-07-14 the prior repository, Git history, plans, source, and generated assets were deleted during disk cleanup. Structured historical session logs survive and are being replayed only when their context can be validated exactly. Every prior implementation and verification claim remains reset until proven again in this checkout.

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
