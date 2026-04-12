#!/usr/bin/env node
import { runMcpStdioServer } from "./server.js";

void runMcpStdioServer().catch((err) => {
  console.error("[nodex-mcp]", err);
  process.exit(1);
});
