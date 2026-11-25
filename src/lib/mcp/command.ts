function quoteArg(arg: string) {
  if (/[\s"]/.test(arg)) return `"${arg.replace(/"/g, '\\"')}"`;
  return arg;
}

/** Command the settings screen copies. The key stays out of the repo. */
export function grokMcpCommand(endpoint: string, token: string, bypass: string) {
  const parts = [
    "grok",
    "mcp",
    "add",
    "--transport",
    "http",
    "finanzas",
    endpoint,
    "--header",
    `Authorization: Bearer ${token}`,
  ];
  const secret = bypass.trim();
  if (secret) {
    parts.push("--header", `x-vercel-protection-bypass: ${secret}`);
  }
  return parts.map(quoteArg).join(" ");
}
