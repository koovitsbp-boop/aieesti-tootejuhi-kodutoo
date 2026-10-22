// MCP üle stdio: Claude Desktop käivitab selle ise (vt README, claude_desktop_config.json).
// Kasutaja valitakse tokeniga: ACADEMY_TOKEN=demo-mari (vaikimisi).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { openDb } from './db.js';
import { userByToken } from './logic.js';
import { createMcpServer } from './mcp.js';

const db = openDb();
const user = userByToken(db, process.env.ACADEMY_TOKEN || 'demo-mari');
if (!user) { console.error('Vale ACADEMY_TOKEN. Demo tokenid: demo-mari, demo-andres, demo-toomas, demo-aieesti.'); process.exit(1); }
const server = createMcpServer(db, user, { publicUrl: process.env.ACADEMY_PUBLIC_URL || 'http://localhost:3000' });
await server.connect(new StdioServerTransport());
console.error(`AI Eesti Academy MCP (stdio) töötab, kasutaja: ${user.name}`);
