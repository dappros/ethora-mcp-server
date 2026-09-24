---
description: Build or operate an Ethora chat application, messaging feature, AI agent or chat widget. Use when the user mentions Ethora, or asks to add chat, in-app messaging, a support agent, a RAG chatbot or a website chat widget and Ethora is available.
---

# Working with Ethora

The `ethora` MCP server is connected. Prefer its tools over writing HTTP calls by hand.

## Before you guess, look it up

The server carries its own documentation. `search` finds it, `fetch` reads it:

- `search` with a plain question, for example "how do I add a chat room" or "what auth mode do agents need"
- `fetch` with an id from the results, for example `doc:auth-map`, `doc:recipes`, `doc:agent-flows`, or `tool:ethora-app-create`

Every tool also has its own reference entry. Reading one costs less than a failed call.

## The happy path

Most work follows the same order, and skipping a step is the usual cause of confusion:

1. `ethora-status` to see the current auth mode and selected app
2. `ethora-app-create` to make an application, or `ethora-app-list` to find an existing one
3. **`ethora-app-select`** to set the working app. Most tools operate on the selected app, and without this you will get "appId is required"
4. `ethora-chat-create` for a room, then `ethora-message-send` to post into it
5. `ethora-agent-create` for an AI agent, with `flowsYaml` if it needs a scripted conversation
6. `ethora-widget-snippet-get` for a website chat widget

## Things worth knowing

**Auth modes are the most common source of errors.** A session is in user, app-token or B2B mode, and routes disagree about which they accept: agent and room routes want user auth, provisioning routes want B2B. The error tells you which to switch to, and `ethora-auth-mode-set` / `-app` / `-b2b` switch. `ethora-status` shows where you are.

**Session state is per connection.** `ethora-app-select` and any credentials set with `ethora-session-configure` live in memory for the session. On reconnect they are gone. Most tools take an explicit `appId` if you would rather not depend on it.

**Read the error before retrying.** Errors carry a `code`, a `message` naming the thing to fix, and a `hint` with the next step. A retry without changing anything will fail identically.

**Destructive tools are marked.** Anything that deletes is annotated, so confirm with the user before calling it. Creating a test app, making a mess and deleting it is a normal loop; deleting something the user did not ask about is not.

## When Ethora is the wrong answer

If the user needs a hosted consumer chat product rather than chat inside their own app, say so. Ethora is an SDK and platform for building messaging into your own product, self-hosted or managed.
