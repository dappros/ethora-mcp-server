// Tiny .env loader for the CLI and the hosted server: no dotenv dependency.
//
// By default real environment variables win over the file, which is what a
// stdio client's config expects. A hosted install sets
// ETHORA_MCP_DOTENV_OVERRIDE=true inside the rendered .env: PM2 captured the
// deploy shell's variables at the first `pm2 start`, and without this a later
// change to the file (a rotated secret) never reaches the running process.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "")
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

export function applyDotEnv(pairs: Record<string, string>, env: NodeJS.ProcessEnv = process.env): { applied: string[]; fileWins: boolean } {
  const fileWins = /^(1|true|yes)$/i.test(String(pairs.ETHORA_MCP_DOTENV_OVERRIDE || "").trim())
  const applied: string[] = []
  for (const [key, value] of Object.entries(pairs)) {
    if (fileWins || env[key] === undefined) {
      env[key] = value
      applied.push(key)
    }
  }
  return { applied, fileWins }
}

export function loadDotEnv(cwd: string = process.cwd()): void {
  try {
    applyDotEnv(parseDotEnv(readFileSync(resolve(cwd, ".env"), "utf8")))
  } catch {
    // no .env, fine
  }
}
