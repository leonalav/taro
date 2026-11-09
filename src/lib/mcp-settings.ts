/** Separate executable and JSON argv fields avoid shell parsing and preserve paths. */
export function parseMcpArguments(value: string): string[] {
  let args: unknown;
  try { args = JSON.parse(value.trim() || "[]"); }
  catch { throw new Error('Arguments must be a JSON array of strings, such as ["--folder", "my project"].'); }
  if(!Array.isArray(args) || args.some(arg=>typeof arg!=="string")) throw new Error("Arguments must be a JSON array of strings.");
  return args;
}

/** Servers may echo credentials in arbitrary errors; expose useful categories only. */
export function mcpConnectionError(error: unknown): string {
  const message=String(error);
  const status=message.match(/\bHTTP\s+(\d{3})\b/i)?.[1];
  if(status) return `MCP returned HTTP ${status}. ${status==='401'||status==='403'?'Check the server credentials and permissions.':status==='404'?'Check the MCP endpoint URL.':status==='429'?'The server rate limit was reached. Retry later.':'Check the server configuration and availability.'}`;
  if(/timed?\s*out|timeout/i.test(message)) return 'MCP connection test timed out. Check that the server is running and reachable.';
  if(/not found|os error 2\b|cannot find/i.test(message)) return 'MCP executable or workspace folder was not found. Check their paths.';
  if(/refused/i.test(message)) return 'The MCP endpoint refused the connection. Check that the server is running.';
  if(/permission denied|access.*denied/i.test(message)) return 'Access to the MCP server was denied. Check executable and workspace permissions.';
  return 'MCP connection test failed. Check the executable, arguments or URL, and server credentials.';
}
