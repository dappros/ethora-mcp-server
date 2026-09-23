// A human landing page for the server root. Directory cards, search results
// and chat messages point people at the bare endpoint, and a browser asking
// for HTML used to get the discovery JSON. Machines still get JSON: the
// handler negotiates on Accept, and the discovery document is unchanged.
//
// Self-contained on purpose (inline CSS, no scripts, no external assets):
// it has to render on any install, behind any CSP, with no build step.

export interface LandingInput {
  name: string
  version: string
  endpoint: string
  personalUrl: string
  oauthEndpoint?: string
  stdioCommand: string
  docsUrl: string
  privacyPolicy: string
  discoveryUrl: string
  hosted: boolean
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

const CSS = `
  :root { color-scheme: light dark; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f4f5f7; color: #1f2933; }
  .wrap { max-width: 720px; margin: 40px auto; padding: 0 16px; }
  .card { background: #fff; border: 1px solid #e3e6ea; border-radius: 12px; padding: 24px 28px; margin-bottom: 16px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  h2 { font-size: 16px; margin: 0 0 10px; }
  p { margin: 0 0 12px; line-height: 1.5; }
  .muted { color: #5f6b7a; font-size: 14px; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; background: #f0f2f5; border-radius: 6px; }
  code { padding: 2px 6px; }
  pre { padding: 12px; overflow-x: auto; margin: 0 0 12px; }
  ol { padding-left: 20px; margin: 0 0 12px; }
  li { margin-bottom: 6px; line-height: 1.5; }
  a { color: #2f6feb; }
  .steps { display: grid; gap: 16px; }
  .footer { font-size: 12px; margin-top: 24px; }
  /* Last, so it wins over the light rules above at equal specificity. */
  @media (prefers-color-scheme: dark) {
    body { background: #121219; color: #e6e6ea; }
    .card { background: #1c1c26; border-color: #2c2c3a; }
    code, pre { background: #262633; }
    .muted { color: #a0a4ad; }
    a { color: #7aa2ff; }
  }
`

export function renderLandingPage(i: LandingInput): string {
  const hostedIntro = i.hosted
    ? `This is the hosted Ethora MCP server. Connect an AI assistant to it and it can create and manage Ethora chat apps, rooms, users, AI agents and website chat widgets for you.`
    : `This is an Ethora MCP server. Connect an AI assistant to it and it can create and manage chat apps, rooms, users, AI agents and website chat widgets on this deployment.`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(i.name)}</title>
<meta name="description" content="Connect Claude, ChatGPT, Cursor or Claude Code to Ethora through this MCP server.">
<style>${CSS}</style></head>
<body><div class="wrap">
  <div class="card">
    <h1>${esc(i.name)}</h1>
    <p class="muted">Model Context Protocol server, Streamable HTTP transport, version ${esc(i.version)}.</p>
    <p>${hostedIntro}</p>
    <p class="muted">You are looking at the machine endpoint in a browser. Nothing is wrong: the steps below are how a person connects. Assistants and crawlers read the <a href="${esc(i.discoveryUrl)}">discovery document</a> instead.</p>
  </div>

  <div class="card steps">
    <div>
      <h2>1. Get your personal connector URL</h2>
      <p>Sign in to the Ethora web app, open <strong>Account &rsaquo; AI Assistants</strong> and create an API key. The page shows a personal URL of the form <code>${esc(i.personalUrl)}</code> together with exact steps for each assistant. Treat that URL like a password.</p>
    </div>
    <div>
      <h2>2. Paste it into your assistant</h2>
      <ol>
        <li><strong>Claude.ai or Claude Desktop</strong>: Settings &rsaquo; Connectors &rsaquo; Add custom connector, name it Ethora, paste the URL. Custom connectors need a Claude Pro, Max, Team or Enterprise plan.</li>
        <li><strong>ChatGPT</strong>: Settings &rsaquo; Apps &amp; Connectors &rsaquo; Advanced settings, turn on Developer mode, then Create with the URL and Authentication set to None. Needs a paid ChatGPT plan.</li>
        <li><strong>Cursor, VS Code, Windsurf, Cline</strong>: add an MCP server with the URL. The AI Assistants page has one-click install buttons and the JSON.</li>
        <li><strong>Claude Code</strong>: <code>claude mcp add --transport http ethora &lt;your personal URL&gt;</code></li>
      </ol>
    </div>
    <div>
      <h2>3. Ask for something</h2>
      <p>For example: <em>"Create an Ethora app called Support Desk, add an AI agent that answers questions from our docs site, and give me the website widget snippet."</em></p>
    </div>
  </div>

  <div class="card">
    <h2>For agents and developers</h2>
    <p><strong>Open endpoint</strong> <code>${esc(i.endpoint)}</code>: connect without credentials and call <code>ethora-user-register</code> or <code>ethora-user-login</code>; both return a revocable API key.</p>
    ${i.oauthEndpoint ? `<p><strong>OAuth 2.1</strong> <code>${esc(i.oauthEndpoint)}</code>: for connector directories; dynamic client registration and PKCE, metadata discoverable from the endpoint.</p>` : ""}
    <p><strong>Local (stdio)</strong>: <code>${esc(i.stdioCommand)}</code></p>
    <p class="muted">Documentation: <a href="${esc(i.docsUrl)}">${esc(i.docsUrl)}</a></p>
  </div>

  <p class="footer muted"><a href="${esc(i.privacyPolicy)}">Privacy policy</a> &middot; <a href="${esc(i.discoveryUrl)}">Discovery (JSON)</a></p>
</div></body></html>
`
}
