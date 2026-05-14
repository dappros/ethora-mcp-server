#!/usr/bin/env node
/**
 * Stamp the version from package.json into every other place that carries it:
 *   - server.json            (top-level "version" + packages[0].version)
 *   - src/index.ts           (McpServer serverInfo "version")
 *   - .plugin/plugin.json    (Open Plugin manifest "version")
 *
 * Run after bumping package.json:  npm run sync-version
 * Then refresh the lockfile separately:  npm install --package-lock-only
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

let changed = 0;

// server.json — JSON, two version fields
{
  const path = join(root, "server.json");
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = version;
  if (Array.isArray(json.packages)) {
    for (const pkg of json.packages) pkg.version = version;
  }
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`server.json          -> ${version}`);
  changed++;
}

// .plugin/plugin.json — Open Plugin manifest
{
  const path = join(root, ".plugin", "plugin.json");
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`.plugin/plugin.json  -> ${version}`);
  changed++;
}

// src/index.ts — serverInfo version literal
{
  const path = join(root, "src", "index.ts");
  const src = readFileSync(path, "utf8");
  const re = /(version:\s*)"[^"]*"/;
  if (!re.test(src)) {
    console.error(`src/index.ts         -> WARNING: no version literal matched`);
  } else {
    writeFileSync(path, src.replace(re, `$1"${version}"`));
    console.log(`src/index.ts         -> ${version}`);
    changed++;
  }
}

console.log(`\nSynced ${changed} file(s) to ${version}. Now run: npm install --package-lock-only`);
