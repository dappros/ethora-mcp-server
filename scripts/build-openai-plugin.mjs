#!/usr/bin/env node
/**
 * Build the ChatGPT plugin ZIP from openai-plugin/ and check it before upload.
 *
 *   npm run plugin:openai           -> dist-plugins/ethora-chatgpt-plugin-<version>.zip
 *
 * Checks mirror what the OpenAI plugin dashboard validates first, so a ZIP
 * that passes here does not bounce on the obvious things: manifest shape and
 * field limits, every referenced asset present and inside the package, the
 * MCP server reachable over HTTPS with the plugin's OAuth entry point, no
 * `apps` references or hooks (not accepted for submission), no secrets.
 */
import { readFileSync, existsSync, mkdirSync, rmSync, statSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "openai-plugin");
const out = join(root, "dist-plugins");
const problems = [];
const warn = (m) => problems.push(m);

const pkgVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const manifest = JSON.parse(readFileSync(join(src, "plugin.json"), "utf8"));
if (manifest.$schema !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json") warn("plugin.json: $schema must be the agent-plugins 1.0.0 plugin schema");
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.name || "")) warn("plugin.json: name must be kebab-case");
if (manifest.version !== pkgVersion) warn(`plugin.json: version ${manifest.version} differs from package.json ${pkgVersion} (run npm run sync-version)`);
const ui = manifest.extensions?.["com.openai"]?.interface || {};
const limit = (k, n) => { if (!ui[k]) warn(`interface.${k} is required`); else if (String(ui[k]).length > n) warn(`interface.${k} exceeds ${n} characters (${String(ui[k]).length})`); };
limit("displayName", 30); limit("shortDescription", 30); limit("longDescription", 4000); limit("developerName", 80);
for (const k of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
  if (!/^https:\/\//.test(ui[k] || "")) warn(`interface.${k} must be an https URL (required for MCP plugins)`);
}
if (!Array.isArray(ui.capabilities) || ui.capabilities.length > 20 || ui.capabilities.some((c) => c.length > 120)) warn("interface.capabilities: up to 20 labels of at most 120 characters");
if (Array.isArray(ui.defaultPrompt) && (ui.defaultPrompt.length > 3 || ui.defaultPrompt.some((p) => p.length > 128))) warn("interface.defaultPrompt: up to 3 prompts of at most 128 characters");
if (ui.brandColor && !/^#[0-9A-Fa-f]{6}$/.test(ui.brandColor)) warn("interface.brandColor must be #RRGGBB");
for (const k of ["logo", "composerIcon", "logoDark", "composerIconDark"]) {
  const p = ui[k]; if (!p) { if (k === "logo" || k === "composerIcon") warn(`interface.${k} is required`); continue; }
  if (!p.startsWith("./")) warn(`interface.${k} must be a ./-relative path`);
  const abs = resolve(src, p); if (!abs.startsWith(src)) warn(`interface.${k} points outside the package`);
  if (!existsSync(abs)) warn(`interface.${k}: ${p} is missing`); else if (statSync(abs).size > 5 * 1024 * 1024) warn(`interface.${k}: ${p} exceeds 5 MiB`);
}
for (const p of ui.screenshots || []) if (!existsSync(resolve(src, p))) warn(`screenshot ${p} is missing`);
if (manifest.extensions?.["com.openai"]?.apps || existsSync(join(src, ".app.json"))) warn("`apps` / .app.json references cannot be submitted");
if (manifest.extensions?.["com.openai"]?.hooks || existsSync(join(src, "hooks"))) warn("lifecycle hooks cannot be submitted");

const mcp = JSON.parse(readFileSync(join(src, "mcp.json"), "utf8"));
if (mcp.$schema !== "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json") warn("mcp.json: $schema must be the agent-plugins 1.0.0 mcp schema");
for (const [name, s] of Object.entries(mcp.mcpServers || {})) {
  if (s.type !== "streamable-http") warn(`mcp.json: ${name}.type should be streamable-http for a hosted server`);
  if (!/^https:\/\//.test(s.url || "")) warn(`mcp.json: ${name}.url must be https`);
}

// Skills: a directory per skill with SKILL.md carrying name + description.
const skillsDir = join(src, "skills");
if (existsSync(skillsDir)) for (const d of readdirSync(skillsDir)) {
  const f = join(skillsDir, d, "SKILL.md");
  if (!existsSync(f)) { warn(`skills/${d}: SKILL.md missing`); continue; }
  const fm = readFileSync(f, "utf8").split("---")[1] || "";
  if (!/^name:/m.test(fm)) warn(`skills/${d}: frontmatter needs name`);
  if (!/^description:/m.test(fm)) warn(`skills/${d}: frontmatter needs description`);
}

// Secrets never ship in the package.
const secretLike = /(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{16,}/i;
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
for (const f of walk(src)) if (/\.(json|md|txt|ya?ml)$/.test(f) && secretLike.test(readFileSync(f, "utf8"))) warn(`${f.replace(root + "/", "")}: looks like it contains a credential`);

// The hosted server must answer on the OAuth entry point with the 401 that
// carries resource metadata; that is how ChatGPT discovers the OAuth flow.
try {
  for (const s of Object.values(mcp.mcpServers || {})) {
    const res = await fetch(s.url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "plugin-build-check", version: "1" } } }) });
    const www = res.headers.get("www-authenticate") || "";
    if (res.status !== 401 || !/resource_metadata=/.test(www)) warn(`${s.url}: expected 401 with WWW-Authenticate resource_metadata (got ${res.status})`);
    const prm = /resource_metadata="([^"]+)"/.exec(www)?.[1];
    if (prm) { const meta = await (await fetch(prm)).json(); if (!meta.authorization_servers?.length) warn(`${prm}: no authorization_servers`); }
  }
} catch (e) { warn(`reachability check failed: ${e?.message || e}`); }

if (problems.length) { console.error("Not building. Fix these first:\n- " + problems.join("\n- ")); process.exit(1); }

mkdirSync(out, { recursive: true });
const zip = join(out, `ethora-chatgpt-plugin-${manifest.version}.zip`);
rmSync(zip, { force: true });
// Zip the contents at the package root (plugin.json at top level), as the dashboard expects.
// Arguments are passed as an array (no shell), so a path never becomes shell syntax.
execFileSync("zip", ["-qr", zip, ".", "-x", ".*", "*/.DS_Store"], { cwd: src, stdio: "inherit" });
console.log(`Built ${zip.replace(root + "/", "")} (${(statSync(zip).size / 1024).toFixed(0)} KB)`);
console.log("Contents:");
const listing = execFileSync("unzip", ["-l", zip], { encoding: "utf8" }).split("\n");
console.log(listing.slice(3, -3).join("\n"));
