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

// Version numbers are calendar-based: YY.M.patch, where YY.M is the year and
// month of the release (26.9.x for September 2026, 26.10.x for October) and
// patch counts releases within the month. No leading zero on the month, so
// 26.10 sorts after 26.9 under semver, and never a major bump for breaking
// changes: the number tells a person when it shipped, nothing else. The
// publish workflow runs this script, so a wrong number cannot be released.
// ETHORA_VERSION_MONTH=YY.M overrides the month check on purpose (a release
// cut on the 1st for the month just ended, for example).
{
  const m = /^(\d{2})\.(1[0-2]|[1-9])\.(\d+)$/.exec(version);
  if (!m) {
    console.error(`package.json version "${version}" is not YY.M.patch (e.g. 26.9.5). See README, "Version numbers".`);
    process.exit(1);
  }
  const now = new Date();
  const expected = process.env.ETHORA_VERSION_MONTH || `${String(now.getUTCFullYear()).slice(2)}.${now.getUTCMonth() + 1}`;
  if (`${m[1]}.${m[2]}` !== expected) {
    console.error(`package.json version "${version}" is for ${m[1]}.${m[2]} but this is ${expected}; use ${expected}.<patch>, or set ETHORA_VERSION_MONTH=${m[1]}.${m[2]} if that is intended.`);
    process.exit(1);
  }
}

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
// Matches both the McpServer serverInfo literal and the SERVER_VERSION constant.
{
  const path = join(root, "src", "index.ts");
  const src = readFileSync(path, "utf8");
  const re = /(version:\s*|const SERVER_VERSION = )"[^"]*"/;
  if (!re.test(src)) {
    console.error(`src/index.ts         -> WARNING: no version literal matched`);
  } else {
    writeFileSync(path, src.replace(re, `$1"${version}"`));
    console.log(`src/index.ts         -> ${version}`);
    changed++;
  }
}

console.log(`\nSynced ${changed} file(s) to ${version}. Now run: npm install --package-lock-only`);
