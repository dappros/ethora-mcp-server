# ChatGPT plugin package

This directory is the ChatGPT plugin for the hosted Ethora MCP server, in the
Agent Plugins format OpenAI's plugin directory accepts: `plugin.json` at the
root, the MCP server in `mcp.json`, reusable skills under `skills/`, icons under
`assets/`. The ZIP uploaded to the OpenAI dashboard is built from here.

The Claude Code plugin in `../claude-plugin/` shares the skills; keep the two in
step when editing a skill.

## Build

```bash
npm run plugin:openai
```

Writes `dist-plugins/ethora-chatgpt-plugin-<version>.zip` after checking the
manifest (field limits, the four required HTTPS pages, icon paths and sizes),
the MCP config (streamable-http over HTTPS), the skills' frontmatter, that no
credential or `apps`/hooks reference is in the package, and that the hosted
server answers the plugin's OAuth entry point with the 401 that carries the
resource metadata ChatGPT uses to discover the login flow. The version comes
from `package.json` (`npm run sync-version` stamps it here too).

## Submit, step by step

Two portal details first: your OpenAI organisation role needs "Apps Management"
write access before anything can be submitted, and the submission type is
**"With MCP"** (not "Skills only"): the MCP endpoint is entered in the portal and
verified there; the ZIP carries the manifest, icons and skills.

1. **Domain verification.** In the OpenAI plugin dashboard, add the MCP server
   URL (`https://mcp.chat.ethora.com/mcp/oauth`). The portal shows a challenge
   token; set it as `services.mcp.openai_apps_challenge` in the production
   deploy config and restart the MCP service. The server then serves it at
   `https://mcp.chat.ethora.com/.well-known/openai-apps-challenge` and the
   portal's check passes. Nothing else in the submission can proceed before
   this step.
2. **Upload the ZIP** from the build above. The dashboard runs its automated
   checks: metadata, skills, MCP tool metadata, domain verification, package
   structure. Required findings must be fixed and a new ZIP uploaded;
   informational ones can go to the review team as they are.
3. **Review information.** Paste the five positive and three negative test
   cases from `../openai-plugin-review/test-cases.json`, the demo video URL,
   and the reviewer account's credentials (enter them in the dashboard only;
   never commit them). Create that account on production beforehand with one
   app, a room and an agent so the positive cases have data.
4. **Submit for review**, accept the policy attestations, and watch "Review
   status" on the Plugins page. A rejection comes with findings; fix, rebuild,
   upload a corrected ZIP (or reply to the rejection email to appeal).
5. **Publish** when approved.

## After publication

OpenAI rescans the hosted MCP server daily, so tool changes on the server
reach ChatGPT without a new package version (use the dashboard's Rescan button
after a deploy to pull them sooner). Metadata and skill changes need a new ZIP,
which creates a new package version with its own checks and review.

## What ChatGPT needs from the server, and where it is

- OAuth 2.1 with dynamic client registration and PKCE: the Ethora API's
  authorization server (`/.well-known/oauth-authorization-server` on the API
  host), discovered from the 401 on `/mcp/oauth`.
- Identity scopes `openid` and `email`, a userinfo endpoint and a verified
  email: present; the consent page offers verification when needed.
- A privacy policy, terms, support and website page over HTTPS: linked from
  `plugin.json`.
- A compact tool list with human titles and explicit annotations: the core
  tool profile (24 tools by default).
