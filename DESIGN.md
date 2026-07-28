# Navo workspace design foundation

## Direction

Navo uses a light, dense working canvas with a graphite navigation shell, compact typography, precise separators and restrained teal accents. Information hierarchy comes from spacing, typography and labels. Icons are reserved for navigation, search, essential actions and genuine exceptions.

## Core tokens

- Canvas: `#f6f7f7`
- Sidebar: `#191b1a`
- Surface: `#ffffff`
- Subtle surface: `#f2f4f3`
- Border: `#e1e5e3`
- Primary text: `#18201e`
- Secondary text: `#596460`
- Muted text: `#7c8783`
- Active accent: `#277f78`
- Success: `#2f7d5c`
- Warning: `#9a6a24`
- Danger: `#b64d52`

## Density and dimensions

- Expanded sidebar: 216px; collapsed sidebar: 56px
- Top bar: 48px
- Page padding: 20–24px
- Navigation row: 32px
- Table row: 40–44px
- Input and standard button: 32px
- Radius: 5–8px
- Context drawer: 360–440px
- Context rail: 280–320px

## Typography

- UI stack: native system sans with PingFang SC / Microsoft YaHei for Chinese
- Caption: 11px / 16px, regular or medium; timestamps and tertiary metadata only
- Label: 12px / 16px, medium; table headers, fields, tabs and badges
- Body: 13px / 20px, regular; dense tables and controls
- Body large: 14px / 22px, regular; drawer explanations and readable prose
- Section title: 16px / 24px, semibold
- Page title: 20px / 24px, semibold
- Supported weights: 400, 500, 600 and 700; 700 is reserved for key numbers
- Numeric tables use tabular numerals

## Company identity

- Use a verified company logo only when a first-party or approved source is available.
- Never fabricate a logo from company initials or a random brand color.
- When no verified logo exists, use the shared neutral company glyph without a decorative tile.

## Page templates

1. Overview page: compact operating summary, attention queue and recent account activity.
2. Directory page: heading, filter bar, dense table and optional preview drawer.
3. Account workspace: identity header, five tabs, main canvas and contextual rail.
4. Workflow page: queue/list, focused work area and details/approval rail.
5. Analytics page: filter strip, key metrics, charts and drill-down table.

## Evidence language

Verified fact, external signal, AI inference, human decision and needs-confirmation items use explicit text labels and source metadata; icons are optional and never the only differentiator. Default, empty and blocking error states are required. Add other edge states only when they are required to understand or operate the primary workflow.

## Active-phase exclusions

Do not prioritize Agents, Tool Status, audit, local deployment or infrastructure screens. Do not turn safety constraints into page themes or repeated callouts. Do not add dark heroes, card matrices, decorative AI icons, pill collections or borders around every content group. Product priority follows the primary operator workflow defined in `PRODUCT.md`.

## Responsive and accessibility rules

The sidebar collapses before the working canvas becomes cramped. Wide tables scroll inside their own region. Rails move below primary content on narrower windows. All icon-only controls need accessible names, keyboard focus remains visible, and truncated company names retain a full-value title or detail view.
