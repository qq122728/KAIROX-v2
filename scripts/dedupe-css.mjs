// CSS selector-level dedup — merges duplicate selectors property-by-property.
// CSS cascade applies last-wins PER PROPERTY, so naive "keep last rule only"
// loses unique properties from earlier rules. We collect all properties across
// all duplicate rules and emit a single merged block.
// Comma-grouped selectors and @-rules left untouched.
import { readFileSync, writeFileSync } from "node:fs";
import { argv } from "node:process";

const file = argv[2];
if (!file) { console.error("usage: node dedupe-css.mjs <file>"); process.exit(1); }
const src = readFileSync(file, "utf8");

// Tokenize file into ordered tokens
const tokens = [];
let i = 0;
const n = src.length;
while (i < n) {
  let wsStart = i;
  while (i < n && /\s/.test(src[i])) i++;
  if (i > wsStart) tokens.push({ kind: "ws", text: src.slice(wsStart, i) });
  if (i >= n) break;

  if (src[i] === "/" && src[i+1] === "*") {
    const end = src.indexOf("*/", i + 2);
    const j = end === -1 ? n : end + 2;
    tokens.push({ kind: "comment", text: src.slice(i, j) });
    i = j;
    continue;
  }

  if (src[i] === "@") {
    let depth = 0;
    const start = i;
    while (i < n) {
      if (src[i] === "{") { depth++; i++; continue; }
      if (src[i] === "}") { depth--; i++; if (depth === 0) break; continue; }
      if (src[i] === ";" && depth === 0) { i++; break; }
      i++;
    }
    tokens.push({ kind: "at", text: src.slice(start, i) });
    continue;
  }

  const selStart = i;
  while (i < n && src[i] !== "{" && src[i] !== "}") i++;
  if (i >= n) { tokens.push({ kind: "ws", text: src.slice(selStart) }); break; }
  const selector = src.slice(selStart, i).trim();
  if (src[i] !== "{") { i++; continue; }
  let depth = 1; i++;
  const bodyStart = i;
  while (i < n && depth > 0) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    i++;
  }
  const body = src.slice(bodyStart, i - 1);
  tokens.push({ kind: "rule", selector, body });
}

// Parse declarations from a rule body — preserves order, splits on top-level semicolons
function parseDecls(body) {
  const decls = [];
  let cur = "";
  let depth = 0;
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === ";" && depth === 0) {
      if (cur.trim()) decls.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) decls.push(cur.trim());
  return decls;
}

// First pass: find which selectors have duplicates (single-selector only)
const selectorCount = new Map();
for (const t of tokens) {
  if (t.kind !== "rule" || t.selector.includes(",")) continue;
  selectorCount.set(t.selector, (selectorCount.get(t.selector) || 0) + 1);
}

// Second pass: for each duplicated selector, merge property-by-property across all occurrences.
// We treat each property declaration as a key->value pair; later occurrences override earlier.
// Property key = the part before ":" (lowercased, trimmed).
function declKey(decl) {
  const colon = decl.indexOf(":");
  if (colon === -1) return decl.trim().toLowerCase();
  return decl.slice(0, colon).trim().toLowerCase();
}

const merged = new Map(); // selector -> Map(propKey -> rawDecl)
const positions = new Map(); // selector -> last token index (where merged rule will be emitted)
tokens.forEach((t, idx) => {
  if (t.kind !== "rule" || t.selector.includes(",")) return;
  if ((selectorCount.get(t.selector) || 0) <= 1) return;
  if (!merged.has(t.selector)) merged.set(t.selector, new Map());
  const map = merged.get(t.selector);
  for (const decl of parseDecls(t.body)) {
    map.set(declKey(decl), decl);
  }
  positions.set(t.selector, idx);
});

// Emit: walk tokens; for non-duplicated rules emit as-is; for duplicated rules
// emit merged at LAST position, drop at earlier positions.
let removedBlocks = 0;
const result = tokens.map((t, idx) => {
  if (t.kind === "ws") return t.text;
  if (t.kind === "comment") return t.text;
  if (t.kind === "at") return t.text;
  // rule
  if (t.selector.includes(",")) return `${t.selector} {${t.body}}`;
  const count = selectorCount.get(t.selector) || 0;
  if (count <= 1) return `${t.selector} {${t.body}}`;
  // duplicated
  if (positions.get(t.selector) !== idx) {
    removedBlocks++;
    return ""; // drop
  }
  // emit merged
  const map = merged.get(t.selector);
  const decls = Array.from(map.values()).join(";\n  ");
  return `${t.selector} {\n  ${decls};\n}`;
}).join("");

// Collapse 3+ blank lines to 2
const cleaned = result.replace(/(\r?\n){3,}/g, "\n\n");

writeFileSync(file, cleaned);
console.log(`Merged ${removedBlocks} duplicate rule blocks (property-level)`);
console.log(`Before: ${src.length} bytes → After: ${cleaned.length} bytes (saved ${src.length - cleaned.length} bytes)`);
