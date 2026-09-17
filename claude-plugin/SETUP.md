---
description: How to connect the Ethora MCP server bundled with this plugin. Follow these steps when the plugin is installed or activated, or when an Ethora tool fails because the connection is not authorised.
---

# Connecting Ethora

This plugin bundles one remote MCP server, `ethora`, at `https://mcp.chat.ethora.com/mcp/oauth`.
It is hosted by Dappros Ltd and reached over HTTPS. Nothing is installed locally and there is no
credential to paste anywhere.

## Connect

1. Open the connection prompt for the `ethora` server. In Claude Code that is `/mcp`; on other
   surfaces the plugin or connector settings show the server with a Connect action.
2. A consent page opens in the browser at `ethora.com`. Sign in with an existing Ethora account, or
   create one on that page. It is free and needs no card.
3. Approve the request. The session is then authorised as that user, with that user's permissions.

Authorisation is per user. Claude cannot see the password, and the token is held by the client, not
by the plugin.

## Confirm it worked

Call `ethora-status`. A connected session reports the current authentication mode and which
application is selected. If it reports no app, that is expected on a new account: create one with
`ethora-app-create`, then make it current with `ethora-app-select`.

## If the connection is refused

- **The tools are listed but every call fails on authentication.** The token expired or was revoked.
  Reconnect the server and approve again.
- **Tools fail with "appId is required".** The connection is fine; no application is selected. Call
  `ethora-app-select`.
- **The consent page asks to confirm an email address.** Complete that step. Some scopes, including
  the identity scopes, are only granted once the address is confirmed.

## Self-hosted Ethora

If the user runs their own Ethora server, the hosted endpoint is the wrong target. Use the stdio
server pointed at their deployment instead:

```
claude mcp add ethora -- npx -y @ethora/mcp-server
```

Set `ETHORA_API_URL` to their API host. `ethora-doctor` reports what configuration is missing.

## What this server can do

Creating applications, provisioning users, opening rooms, posting messages, configuring AI agents
and generating a widget snippet are all write operations against the authorised account. Deleting an
application or a user is destructive and cannot be undone, so confirm with the user before calling
those tools. The server carries its own reference documentation: `search` finds it and `fetch` reads
it, for example `fetch` with `doc:auth-map` or `doc:recipes`.
