# Design Tokens

These tokens define the VORX admin console visual system. They are expressed as CSS variables for design clarity; implementation can map them to CSS modules, global CSS, or component tokens.

## Color Tokens

```css
:root {
  --bg: #090f19;
  --side: #0d1726;
  --panel: #111c2c;
  --panel-soft: #142234;
  --row: #101a2a;
  --row-hover: #142238;
  --line: #18263a;
  --line-strong: #253854;
  --text: #eef5ff;
  --text-sub: #b9c7dc;
  --text-muted: #7f90aa;
  --brand-blue: #4f8cff;
  --brand-blue-soft: #7aa7ff;
  --success: #25c99a;
  --warning: #f5a524;
  --danger: #f46f76;
  --disabled: #94a3b8;
}
```

## Semantic Colors

| Semantic | Token | Usage |
| --- | --- | --- |
| Background | `--bg` | App page background |
| Sidebar | `--side` | Main navigation |
| Panel | `--panel` | Cards, tables, Drawer |
| Row | `--row` | Table row background |
| Hover Row | `--row-hover` | Table hover |
| Primary Text | `--text` | Main copy and numbers |
| Secondary Text | `--text-sub` | Secondary labels |
| Muted Text | `--text-muted` | Helpers and timestamps |
| Brand | `--brand-blue` | Primary actions, selected states |
| Running | `--brand-blue-soft` | Realtime/running/processing states |
| Success | `--success` | Approved, normal, profitable |
| Warning | `--warning` | Pending, awaiting action, maintenance |
| Danger | `--danger` | Rejected, frozen, loss, dangerous |
| Disabled | `--disabled` | Off, canceled, unavailable |

## Typography

Font stack:

```css
font-family: Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
```

Numeric values:

```css
font-variant-numeric: tabular-nums;
```

Recommended sizes:

| Element | Size | Weight |
| --- | --- | --- |
| Page title | 20px | 830 |
| Panel title | 15px | 700-800 |
| Metric number | 38-40px | 870 |
| Table body | 13px | 400-760 |
| Table header | 11px | 850 |
| Filter chip | 12px | 780 |
| Helper text | 12px | 400-600 |

## Spacing

| Token | Value | Usage |
| --- | --- | --- |
| Sidebar width | 268px | Desktop nav |
| Header height | 88px | Page header |
| Content padding | 30px 32px 36px | Main page content |
| Page gap | 20px | Vertical section gap |
| Card gap | 14px | Metric cards |
| Toolbar padding | 16px 20px 18px | Filter toolbar |
| Table row gap | 8px | Separated rows |
| Drawer width | 440px | Standard right Drawer |

## Radius

| Element | Radius |
| --- | --- |
| Sidebar logo | 12px |
| Nav item | 11px |
| Panel | 18px |
| Metric card | 17px |
| Table row | 14px |
| Status chip | 999px |
| Drawer block | 16px |
| Button | 11px |

## Component Tokens

Metric card:

```css
height: 112px;
border-radius: 17px;
background: linear-gradient(180deg, rgba(17,28,44,.92), rgba(15,25,40,.92));
border: 1px solid var(--line);
```

Table row:

```css
height: 74px;
background: var(--row);
border-top: 1px solid #17263a;
border-bottom: 1px solid #17263a;
```

Drawer:

```css
width: 440px;
background: #0f1928;
border-left: 1px solid var(--line-strong);
box-shadow: -28px 0 80px rgba(0,0,0,.32);
```

Status chip:

```css
height: 24px;
padding: 0 9px;
border-radius: 999px;
font-size: 11px;
font-weight: 850;
```

