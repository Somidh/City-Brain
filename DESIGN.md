# Visual Design Contract

Chat is a quiet, full-canvas conversation workbench. AgentKit owns the
conversation primitives; the template owns the surrounding navigation and
workspace chrome.

## Product mode

- Mode: `operate`
- Audience and cadence: frequent users managing many ongoing agent threads.
- Primary workflow: begin, resume, pin, and organize conversations without
  leaving the chat canvas.

## Visual direction

- Direction name: Quiet conversation library
- Palette family: neutral ink and semantic surfaces; active rows use the
  existing sidebar accent rather than a separate branded color.
- Type treatment: dense sans-serif labels with regular-weight conversation
  titles and restrained section labels.
- Composition: a persistent conversation library beside a generous chat
  canvas. New chat is the primary rail action, followed by Pinned and Recents.
  Account, workspace, settings, and sign-out controls disclose from one footer
  row instead of competing in the rail.
- Shape language: borderless lists, soft selected rows, quiet corners, and
  compact icon controls.
- Anti-references: icon-only navigation as the default state, floating chips,
  duplicated settings links, timestamps competing with thread titles, and
  placeholder destinations that the app does not implement.

## Guardrails

- Preserve the scaffold's semantic tokens and shared component seams.
- Keep domain pages distinct from full-page chat and use the AgentSidebar for
  contextual AI.
- Compare sibling apps before reusing their palette or composition.
- Keep pinning, rename, archive, and routing wired to the shared chat thread
  model; the sidebar is a presentation layer, not a second history store.

## City Brain direction (`/city`, `/report`, `/track/:id`)

| Decision | Choice |
| --- | --- |
| Product mode | `operate`: one supervisor watching a live city and making the calls agents can't |
| Audience and cadence | Supervisor on a big screen all shift, glancing more than reading |
| Visual world | Night-shift control room over a living city: calm dark, small lights that mean something |
| Palette family | Pine / teal accent (`--city-accent`) on cool navy-black neutrals; severity stays semantic (red / orange / amber / green) |
| Type treatment | Sans-first (Inter), monospace only for ids, money and the action names |
| Composition | Focused workbench: decisions left, living map centre, agent chatter right, city mood + stats bottom |
| Shape language | Soft utility surfaces (`rounded-xl`), city blocks on asphalt, round markers and worker tokens |
| Anti-references | Generic gradient hero, glass cards, equal-weight stat tiles over the content, decoration with no state behind it |

Fun is earned by state, not ornament. Workers drive along dashed routes to their jobs. New reports drop in with a ripple. An agent node lights up when that agent acts. Windows flicker in the skylines. The city has a mood face computed from emergencies, waiting decisions and overdue jobs. All motion is short and switches off under `prefers-reduced-motion`. Tokens live under `.city-ops` in `app/global.css`.
