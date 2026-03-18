# Ethora MCP CLI (Model Context Protocol)

[![npm](https://img.shields.io/npm/v/@ethora/mcp-server.svg)](https://www.npmjs.com/package/@ethora/mcp-server)
[![Node](https://img.shields.io/badge/node-%E2%89%A518.x-blue.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

An MCP (Model Context Protocol) CLI that simplifies using **Ethora** platform in AI-assisted or agentic mode.  
Use it from **Cursor**, **VS Code MCP**, **Claude Code**, or **Windsurf/Cline** to log in, manage apps, users and chats, and interact with wallets.

**Part of the [Ethora SDK ecosystem](https://github.com/dappros/ethora#ecosystem)** — see all SDKs, tools, and sample apps. Follow cross-SDK updates in the [Release Notes](https://github.com/dappros/ethora/blob/main/RELEASE-NOTES.md).

---

## ✨ What you get

- **Auth & Accounts**
  - `login` — login user
  - `register` — register user

- **Applications**
  - `create-application` — create app
  - `update-application` — update app
  - `delete-application` — delete app
  - `list-applications` — list apps

- **Chat & Rooms**
  - `get-default-rooms` — list default rooms
  - `app-get-default-rooms-with-app-id` — rooms for a given app
  - `create-app-chat` — create chat for app
  - `delete-app-chat` — delete chat

- **Wallet**
  - `get-wallet-balance` — get balance
  - `wallet-erc20-transfer` — send ERC-20 tokens

> Tool names above reflect the functional areas exposed by the server. Your exact tool names may vary slightly by version; run the client’s “list tools” to confirm.


<img width="1670" height="995" alt="settings" src="https://github.com/user-attachments/assets/5a3e98da-5362-4ed2-9080-473510ad2837" />
<img width="1691" height="1011" alt="login" src="https://github.com/user-attachments/assets/c70fc2d7-4686-4619-aaad-0ca966ac2912" />


## 📦 Install / Run

### Pre-requisites
Before you begin, ensure you have the following:
- Node.js installed on your system (recommended version 18.x or higher).

### Install

The server is distributed as an npm package and is typically launched by MCP clients via **npx**:

```bash
npx -y @ethora/mcp-server
```

No global install is required.

---

## 🔐 Configuration (env vars)

The current implementation has no configuration through environment variables.

---

## 🚀 Using with MCP Clients

### Cursor

1. Open **Cursor → Settings → MCP**
2. Click **Add new global MCP server**
3. Add an entry for the GrowthBook MCP, following the pattern below:

```json
{
  "mcpServers": {
    "ethora-mcp-server": {
      "command": "npx",
      "args": ["-y", "@ethora/mcp-server"]
    }
  }
}
```

3. Save. You should see **green active** when connected.


### VS Code (MCP extension)

1. Open **User Settings (JSON)**
2. Add an MCP entry:

```json
 "mcp": {
    "servers": {
      "ethora-mcp-server": {
        "command": "npx",
        "args": [
          "-y", "@ethora/mcp-server"
        ]
      }
    }
  }
```

3. Save. The server will auto-start on first use.


### Claude Desktop

1. **Settings → Developer**
2. Click **Edit Config**
3. Open `claude_desktop_config.json`
4. Add the following configuration:

```json
{
  "mcpServers": {
    "ethora-mcp-server": {
      "command": "npx",
      "args": ["-y", "@ethora/mcp-server"]
    }
  }
}
```

### Windsurf (Cline)

1. Run:
   ```bash
   npx -y @ethora/mcp-server
   ```
2. Configure your `mcp_config.json` similarly:
   ```json
   {
     "mcpServers": {
       "ethora-mcp-server": {
         "command": "npx",
         "args": ["-y", "@ethora/mcp-server"]
       }
     }
   }
   ```

   ---

   ---

## 🧪 Quick test

After the server shows as **connected** in your client:

- Run `list tools` (client command) to verify Ethora tools are available.
- Try a login:
  ```
  Use the "login" tool with your Ethora credentials.
  ```
- List applications:
  ```
  Call "list-applications" to verify connectivity.
  ```
- Check wallet:
  ```
  Call "get-wallet-balance".
  ```

---

## 🛡️ Security notes

- **Never** hardcode API keys in shared config. Prefer client-side secret stores.
- Use **least privilege** keys and consider **allowlists/rate limits** on your Ethora backend.
- Rotate credentials regularly in production use.

---

## 🧰 Development

Clone and run locally:

```bash
git clone https://github.com/dappros/ethora-mcp-server.git
cd ethora-mcp-server
npm install
npm run build
npm start
```

Suggested scripts (if not present):
```json
{
  "scripts": {
    "build": "tsc -p .",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  }
}
```

---

## ❓ Troubleshooting

- **Client can’t connect**: Ensure `npx @ethora/mcp-server` runs locally without errors. Check Node ≥ 18.
- **Auth errors**: Verify `ETHORA_BASE_URL` and any required secrets are set in the client’s environment.
- **Tools missing**: Restart the MCP client and inspect server logs for registration errors.
- **Network**: Confirm outbound access from the IDE to your Ethora host.

---

## 🔗 Related Repos

- **Ethora Chat Component** — our React chat component used in widgets and stand-alone apps
  https://github.com/dappros/ethora-chat-component
- **Ethora WP Plugin** — WordPress integration  
  https://github.com/dappros/ethora-wp-plugin
- **RAG Demos** — RAG AI assistant examples  
  https://github.com/dappros/rag_demos

---

## 📜 License

See [LICENSE](./LICENSE).
