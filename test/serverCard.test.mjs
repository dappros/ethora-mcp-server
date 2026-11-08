import { test } from "node:test"
import assert from "node:assert/strict"
import { buildServerCard, buildAiCatalog, SERVER_CARD_SCHEMA, SERVER_CARD_MEDIA_TYPE } from "../dist/serverCard.js"

const opts = { title: "Ethora MCP Server", version: "26.11.0", publicBase: "https://mcp.example.com", endpoint: "https://mcp.example.com/mcp", oauthEndpoint: "https://mcp.example.com/mcp/oauth" }

test("server card satisfies the SEP-2127 schema constraints", () => {
  const card = buildServerCard(opts)
  assert.equal(card.$schema, SERVER_CARD_SCHEMA)
  assert.match(card.name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/)
  assert.ok(card.name.length >= 3 && card.name.length <= 200)
  assert.ok(card.description.length >= 1 && card.description.length <= 100, `description ${card.description.length} chars`)
  assert.ok(card.title.length >= 1 && card.title.length <= 100)
  assert.equal(card.version, "26.11.0")
  assert.doesNotMatch(card.version, /[~^<>*]/)
  assert.equal(card.repository.source, "github")
  for (const icon of card.icons) assert.match(icon.src, /^https:\/\//)
  for (const r of card.remotes) {
    assert.equal(r.type, "streamable-http")
    assert.match(r.url, /^https:\/\//)
    assert.ok(r.supportedProtocolVersions.length > 0)
  }
  for (const key of Object.keys(card._meta)) {
    const prefix = key.split("/")[0]
    assert.ok(key.includes("/"), key)
    assert.doesNotMatch(prefix, /(modelcontextprotocol|mcp)$/, `${key} uses a reserved prefix`)
  }
})

test("remotes list the open, OAuth and templated personal endpoints", () => {
  const card = buildServerCard(opts)
  assert.deepEqual(card.remotes.map((r) => r.url), [
    "https://mcp.example.com/mcp",
    "https://mcp.example.com/mcp/oauth",
    "https://mcp.example.com/mcp/k/{api_key}",
  ])
  const personal = card.remotes[2]
  assert.equal(personal.variables.api_key.isSecret, true)
  assert.equal(personal.variables.api_key.isRequired, true)
})

test("the OAuth remote is omitted when OAuth is not configured", () => {
  const card = buildServerCard({ ...opts, oauthEndpoint: undefined })
  assert.deepEqual(card.remotes.map((r) => r.url), ["https://mcp.example.com/mcp", "https://mcp.example.com/mcp/k/{api_key}"])
})

test("AI catalog points at the card with the card media type", () => {
  const catalog = buildAiCatalog({ publicBase: "https://mcp.example.com" })
  assert.equal(catalog.specVersion, "1.0")
  assert.equal(catalog.entries.length, 1)
  assert.equal(catalog.entries[0].identifier, "urn:air:mcp.example.com:mcp:ethora-mcp-server")
  assert.equal(catalog.entries[0].type, SERVER_CARD_MEDIA_TYPE)
  assert.equal(catalog.entries[0].url, "https://mcp.example.com/mcp/server-card")
})
