#!/usr/bin/env node
/** Default entrypoint: stdio (backwards compatible with Cursor local MCP). */
import { startStdioServer } from "./server/stdio.js";

await startStdioServer();
