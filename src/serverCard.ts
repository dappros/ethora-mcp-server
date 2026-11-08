import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js"

// MCP Server Card (extension SEP-2127, Final, January 2026): a static description
// of a remote MCP server for directories, catalogs and clients. It covers identity
// and remote endpoints only; tools, resources and prompts are read at runtime and
// local-install data belongs to the Registry's server.json. Media types and the
// discovery flow follow the extension's docs/discovery.md.
export const SERVER_CARD_SCHEMA = "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json"
export const SERVER_CARD_MEDIA_TYPE = "application/mcp-server-card+json"
export const AI_CATALOG_MEDIA_TYPE = "application/ai-catalog+json"

// Registry name (io.github.<owner>/<repo>), the same as server.json.
export const SERVER_CARD_NAME = "io.github.dappros/ethora-mcp-server"
// The schema caps description at 100 characters.
export const SERVER_CARD_DESCRIPTION = "Ethora chat platform MCP: apps, users, rooms, AI agents, chat widgets. Hosted or stdio."

export type ServerCardOptions = {
  /** Human-readable name shown by clients (schema `title`). */
  title: string
  version: string
  /** Public origin of the hosted server, e.g. https://mcp.chat.ethora.com */
  publicBase: string
  /** Open Streamable HTTP endpoint, e.g. https://mcp.chat.ethora.com/mcp */
  endpoint: string
  /** OAuth-protected endpoint; omitted from the card when OAuth is not configured. */
  oauthEndpoint?: string
}

type CardInput = {
  description?: string
  isRequired?: boolean
  isSecret?: boolean
  placeholder?: string
}

type CardRemote = {
  type: "streamable-http" | "sse"
  url: string
  supportedProtocolVersions: string[]
  variables?: Record<string, CardInput>
}

export function buildServerCard(o: ServerCardOptions) {
  const versions = [...SUPPORTED_PROTOCOL_VERSIONS]
  const remotes: CardRemote[] = [
    { type: "streamable-http", url: o.endpoint, supportedProtocolVersions: versions },
  ]
  if (o.oauthEndpoint) remotes.push({ type: "streamable-http", url: o.oauthEndpoint, supportedProtocolVersions: versions })
  // The personal URL as a templated remote: clients that cannot send headers
  // (Claude.ai, ChatGPT custom connectors) put the key in the path.
  remotes.push({
    type: "streamable-http",
    url: `${o.publicBase}/mcp/k/{api_key}`,
    variables: {
      api_key: {
        description: "Ethora API key. Issued by ethora-user-register or ethora-user-login on the open endpoint, or in the Ethora dashboard.",
        isRequired: true,
        isSecret: true,
      },
    },
    supportedProtocolVersions: versions,
  })
  return {
    $schema: SERVER_CARD_SCHEMA,
    name: SERVER_CARD_NAME,
    title: o.title,
    version: o.version,
    description: SERVER_CARD_DESCRIPTION,
    websiteUrl: "https://ethora.com/ai-sdk/mcp-server/",
    repository: { source: "github", url: "https://github.com/dappros/ethora-mcp-server" },
    icons: [
      { src: "https://ethora.com/wp-content/uploads/2026/11/cropped-ethora-favicon-512-192x192.png", mimeType: "image/png", sizes: ["192x192"] },
    ],
    remotes,
    // Vendor extension data. Reverse-DNS prefix as the schema's MetaObject asks;
    // prefixes ending in "mcp" or "modelcontextprotocol" are reserved.
    _meta: {
      "com.ethora/discovery": `${o.publicBase}/.well-known/mcp`,
      "com.ethora/stdio": { package: "@ethora/mcp-server", command: "npx -y @ethora/mcp-server" },
      "com.ethora/docs": "https://github.com/dappros/ethora-mcp-server#readme",
      "com.ethora/privacyPolicy": "https://ethora.com/privacy-policy-mcp/",
    },
  }
}

// AI Catalog (/.well-known/ai-catalog.json): the site-wide entry point clients
// fetch first; it points at the card rather than embedding it.
export function buildAiCatalog(o: { publicBase: string }) {
  const host = new URL(o.publicBase).hostname
  return {
    specVersion: "1.0",
    entries: [
      { identifier: `urn:air:${host}:mcp:ethora-mcp-server`, type: SERVER_CARD_MEDIA_TYPE, url: `${o.publicBase}/mcp/server-card` },
    ],
  }
}
