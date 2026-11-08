// The .env loader: environment wins by default; the file wins when it says so.
import test from "node:test"
import assert from "node:assert/strict"
import { parseDotEnv, applyDotEnv } from "../dist/dotenv.js"

test("parse handles comments, export prefixes and quotes", () => {
  const pairs = parseDotEnv('# c\nexport A=1\nB="two words"\nC=\'x\'\nbad line\n')
  assert.deepEqual(pairs, { A: "1", B: "two words", C: "x" })
})

test("by default an existing environment variable is kept", () => {
  const env = { A: "env" }
  const r = applyDotEnv({ A: "file", B: "file" }, env)
  assert.deepEqual(env, { A: "env", B: "file" })
  assert.equal(r.fileWins, false)
  assert.deepEqual(r.applied, ["B"])
})

test("with ETHORA_MCP_DOTENV_OVERRIDE=true in the file, the file wins", () => {
  const env = { A: "env" }
  const r = applyDotEnv({ ETHORA_MCP_DOTENV_OVERRIDE: "true", A: "file" }, env)
  assert.equal(env.A, "file")
  assert.equal(r.fileWins, true)
})
