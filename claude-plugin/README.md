# Ethora plugin for Claude

Build and operate [Ethora](https://ethora.com) chat applications and AI agents from Claude Code and
Claude Cowork.

Ethora is an open-source chat and messaging platform with a built-in AI agent framework. This plugin
connects Claude to the hosted Ethora MCP server, so you can create applications, provision users,
open chat rooms, send messages, configure RAG-backed AI agents, script deterministic conversation
flows and generate an embeddable website chat widget, without leaving the session.

Everything it ships is portable across surfaces: two skills and one remote MCP server, reached over
HTTPS. There are no hooks, no sub-agents and no local binaries, so nothing greys out in chat.

## Install

From this repository, on either surface:

```
/plugin marketplace add dappros/ethora-mcp-server
/plugin install ethora@dappros
```

In Cowork, open the Cowork tab first, then Customize, then Plugins.

On first use Claude opens an Ethora consent page in your browser. Sign in, or create an account
there, and the connection completes. You never paste a credential into a config file. `SETUP.md`
walks Claude through that and through the usual failure cases.

## What you get

- The Ethora MCP server, connected over OAuth as you, with your permissions
- A skill that routes Claude to the right tool and the right order for common tasks
- A skill for authoring agent conversation flows, which is the fiddliest part of the product

## Try it

```
Create an Ethora app called Acme Support, add a general room, and invite two test users.
Build a support agent that answers from https://acme.example.com, then give me the widget snippet.
Write an appointment-booking flow for my Ethora agent, with an opening menu.
```

## Self-hosting

If you run Ethora yourself, use the stdio server instead and point it at your own deployment:

```
claude mcp add ethora -- npx -y @ethora/mcp-server
```

Set `ETHORA_API_URL` to your API. See the
[server README](https://github.com/dappros/ethora-mcp-server#readme) for the credential options.

## Links

- Product page: https://ethora.com/ai-sdk/mcp-server/
- Tool reference: https://ethora.com/ai-sdk/mcp-server/tools/
- Source: https://github.com/dappros/ethora
- Privacy policy for the hosted server: https://ethora.com/privacy-policy-mcp/

MIT licensed.
