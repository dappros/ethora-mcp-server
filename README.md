# Model Context Protocol (MCP) Server for Ethora Platform
## Overview
The Model Context Protocol (MCP) Server enables integration between MCP clients and the Ethora service.


<img width="1670" height="995" alt="settings" src="https://github.com/user-attachments/assets/5a3e98da-5362-4ed2-9080-473510ad2837" />
<img width="1691" height="1011" alt="login" src="https://github.com/user-attachments/assets/c70fc2d7-4686-4619-aaad-0ca966ac2912" />

## Tools

- Login user
- Register user
- Create application
- Delete application
- Update application
- List applications
- get-default-rooms
- app-get-default-rooms-with-app-id
- create-app-chat
- delete-app-chat
- get-wallet-balance
- wallet-erc20-transfer

Before you begin, ensure you have the following:

- Node.js installed on your system (recommended version 18.x or higher).

## Installation

### Cursor

1. Open **Cursor Settings** &rarr; **MCP**
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

3. Save the settings.

You should now see a green active status after the server successfully connects!

### VS Code

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

3. Save your settings.

Ethora MCP is now ready to use in VS Code.

### Claude Desktop

1. **Open Settings** &rarr; **Developer**
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

### Installing via Windsurf

To install ethora-mcp-server in Windsurf IDE application, Cline should use NPX:

```bash
npx -y @ethora/mcp-server
```

Your mcp_config.json file should be configured similar to:

```json
{
    "mcpServers": {
        "ethora-mcp-server": {
            "command": "npx",
            "args": [
                "-y",
                "@ethora/mcp-server"
            ]
        }
    }
}
```
