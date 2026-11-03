# Qoima design system

## Authority and interpretation
This system implements the user's comprehensive dark redesign brief of 2026-11-03. The supplied Linear style reference informs palette, typography, density and surface treatment. It is reference material, not a requirement to reproduce a marketing site. Earlier light/forest/cobalt layouts and font pairings are historical, not current authority.

Mode: Operate. The first screen must make products, balances, stock changes and movement history understandable. No hero, social-proof strip, decorative illustration, invented claims or marketing section spacing is used.

## Composition
Desktop uses one horizontal navigation header: Qoima, Products, Dashboard, History, Categories, then Settings/account/sign out. The work area spans up to 1440 px with 32 px gutters. Mobile uses a 64 px brand/Menu header and modal navigation drawer with focus trapping, Escape and trigger restoration. Navigation destinations and auth redirects retain their existing meaning.

Products is an inventory work surface: one primary Add product action, complete Export choices, visibility tabs with whole-account counts, labeled filters, one scoped result line and aligned data. Stock in, Stock out and Adjust stock are explicit; More contains metadata/history/archive actions. Mobile rows preserve all stock actions with 44 px targets. Quantity, minimum and status form the repeated scan pattern; money aligns right. No product thumbnails or repetitive metric cards.

Product details put the balance and status first, followed by stock actions, separate metadata actions and a compact information grid. Archives remain read-only. Dashboard has a single current-inventory strip, chart and attention area, then recent movements. Categories are rows; History is a filterable ledger; Settings contains real account actions only.

## Themes and tokens
The approved dark design remains intact: canvas #08090A; surface #0F1011; raised #161718; selected #242629; primary text #F3F4F5 and secondary #A1A5AD. Structural borders #2B2D31 are subtle, with stronger #686D75 control boundaries. Lime #E4F222 primary actions use #08090A text.

Light uses canvas #F7F8FA, white surface, raised #F0F2F4, selected #E9ECF0, graphite #18181B and secondary #52525B. Links/focus use accessible dark roles rather than bright lime on white. Lime buttons retain dark text and a contrasting boundary. Semantic green/amber/red status roles and teal/amber/lavender chart series are adjusted for each surface, preserving meaning and text labels.

All roles are centralized in `src/design-tokens.css`, with Light defaults and `[data-theme="dark"]` overrides. Components consume roles, not per-theme color patches or inversion. Native color-scheme/select/date/autofill treatment follows the resolved theme.

## Appearance interaction
Only Settings exposes the three-option native radio selector: Light, Dark, System, with icons, words, selected checks and keyboard focus. No auth/header/navigation switch is present. The selected preference is stored locally as the literal value; System is the fallback/default and follows live OS changes, while explicit choices override it. All pages inherit the resolved theme.

The blocking `public/appearance.js` initializer runs before the app module/styles and is the same observable controller consumed by React. Storage failures do not crash the app or clear existing keys. Theme preferences belong to this browser and remain independent of account/inventory state. Source and unit checks verify initialization order; rendered captures do not by themselves prove frame-by-frame absence of a flash.

## Typography and spacing
One official self-hosted Inter Variable WOFF2, SIL OFL 1.1, `font-display: swap`, exposed weights 400–590. Body/data 13–14 px, labels/metadata 12 px, headings 25–28 px, form inputs 16 px and restrained balance figures up to 36 px. Tabular numerals align quantities/prices. No proprietary font or extra monospace asset is needed. The brand uses the supplied geometric Q/storage-cell symbol, live Qoima wordmark and optional Digital Warehouse tagline. The full and symbol-only components share a local SVG. Dark uses lime/light branding; Light uses graphite branding. The favicon keeps a recognizable lime mark on a dark tile.

Spacing follows 4 px steps: controls 8/12, rows 16, groups 20/24, sections 28/32. Operational pages do not inherit the reference's 96 px marketing gaps. Borders separate surfaces; no ambient glow, decorative gradient, glass, particles or entrance animations. Button press feedback is brief and removed under reduced motion; loading feedback retains text.

## States and accessibility
Loading, empty inventory, archived-only inventory, no matches, read failure/retry, submitting, disabled, success, recovery and confirmation states remain explicit. Primary text pairs pass 4.5:1; meaningful controls/focus/chart colors pass 3:1. Labels persist; keyboard focus remains visible. Tables and charts scroll inside labeled containers. Modal dialogs constrain height and preserve scrolling, focus trapping and restoration. Small viewport checks target 390 px.

Authentication has a quiet brand header, return navigation and one focused form. Desktop forms are 440 px wide; mobile forms are unboxed with comfortable controls. Email confirmation explains the link, next step, spam/address check and sign-in/reset alternatives. No promotional split panel or implementation jargon is added.

## Guidance and boundaries
Impeccable 4.8.0: Operate/new-work, craft floor, typography/layout and final polish/audit guidance. The concept-seed helper ran without its external catalog; the user's pinned brief and explicit instruction to implement without another approval round determined the design. No catalog comparison or quality-board review is claimed. Its source detector's four Inter popularity warnings are acknowledged as aesthetic heuristics, not defects in this brief.

Unslop 2.3.0 is writing guidance only, read from its official repository: core contract, rewrite and crisp-human preset. Copy changes remove confirmed repetition/ambiguity while preserving quantities, conditions, uncertainty and action meaning. It is not installed; its scanners were not run and it was not treated as a visual framework.

Database/RPC/auth/session/stock recovery/calculation/export contracts are unchanged. Local fictional fixtures never enter production flows. Historical browser captures remain in ignored local artifacts and are not published. The current performed-check status and outstanding verification are documented in `docs/release-checklist.md`; local captures do not establish remote authentication, authorization or concurrency results.
