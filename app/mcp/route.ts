import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "@/lib/mcp/server";

// Streamable HTTP MCP endpoint. Each request gets a fresh server from the
// factory, so any serverless instance can answer any request.
const handler = createMcpHandler(createServer);

export const dynamic = "force-dynamic";

// Browser-based MCP clients (inspectors, web hosts) need CORS.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version",
};

async function handle(request: Request): Promise<Response> {
  const response = await handler.fetch(request);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

export { handle as GET, handle as POST, handle as DELETE };

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
