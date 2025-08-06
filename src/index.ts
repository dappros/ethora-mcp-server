#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

export const server = new McpServer(
  {
    name: "Ethora MCP Server",
    version: "1.0.0",
  }
);

registerTools(server);

async function runServer() {
  try {
    console.error("Attempting to start Graphlit MCP Server.");

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Successfully started Graphlit MCP Server.");
  } catch (error) {
    console.error("Failed to start Graphlit MCP Server.", error);

    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Failed to start Graphlit MCP Server.", error);

  process.exit(1);
});
