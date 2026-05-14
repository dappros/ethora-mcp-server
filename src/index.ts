#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { registerPromptsAndResources } from "./prompts.js";

export const server = new McpServer(
  {
    name: "Ethora MCP Server",
    version: "26.5.1",
  }
);

registerTools(server);
registerPromptsAndResources(server);

async function runServer() {
  try {
    console.error("Attempting to start Ethora MCP Server.");

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("Successfully started Ethora MCP Server.");
  } catch (error) {
    console.error("Failed to start Ethora MCP Server.", error);

    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Failed to start Ethora MCP Server.", error);

  process.exit(1);
});
