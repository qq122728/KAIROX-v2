import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const defaultRoots = ["realtime", "tests", "scripts"];
const requestedRoots = process.argv.slice(2);
const roots = requestedRoots.length ? requestedRoots : defaultRoots;
const files = [];

function collectMjsFiles(rootPath) {
  if (!existsSync(rootPath)) return;
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) collectMjsFiles(fullPath);
    else if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(fullPath);
  }
}

for (const root of roots) collectMjsFiles(path.resolve(projectRoot, root));

files.sort((left, right) => left.localeCompare(right));

if (files.length === 0) {
  console.log("No .mjs files found.");
  process.exit(0);
}

let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  const relativePath = path.relative(projectRoot, file);

  if (result.status === 0) {
    console.log(`ok ${relativePath}`);
    continue;
  }

  failed = true;
  console.error(`fail ${relativePath}`);
  if (result.stdout?.trim()) console.error(result.stdout.trim());
  if (result.stderr?.trim()) console.error(result.stderr.trim());
}

if (failed) process.exit(1);

console.log(`Checked ${files.length} .mjs files.`);
