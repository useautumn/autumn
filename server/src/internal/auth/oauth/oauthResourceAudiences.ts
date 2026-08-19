import { getAutumnEnv } from "@autumn/env";

const MCP_RESOURCE_PATHS = ["/mcp"];

const parseMcpResourceUrl = (rawUrl: string) => {
	const resourceUrl = rawUrl.trim();
	if (!resourceUrl) return null;

	try {
		return new URL(resourceUrl).href;
	} catch {
		console.warn(`Ignoring invalid MCP_RESOURCE_URLS entry: ${resourceUrl}`);
		return null;
	}
};

const getConfiguredMcpResourceUrls = () =>
	process.env.MCP_RESOURCE_URLS?.split(",")
		.map(parseMcpResourceUrl)
		.filter((url): url is string => Boolean(url)) ?? [];

/**
 * Public hosts that serve OAuth-protected MCP endpoints. leaf serves both the
 * MCP server (MCP_SERVER_URL) and the chat/slackbot (CHAT_SERVER_URL); the
 * autumn server can also proxy /mcp under its own API origin.
 * The OAuth `resource` indicator is host-based, so every public host + path
 * must be a registered audience. MCP_RESOURCE_URLS is an explicit override.
 *
 * Read lazily so a deployment can change the override without a rebuild, and so
 * importing this module never depends on env being loaded yet.
 */
export const getMcpOAuthResourceUrls = (): string[] => {
	const isProduction = process.env.NODE_ENV === "production";
	const mcpServerUrl =
		process.env.MCP_SERVER_URL ??
		(isProduction ? "https://mcp.useautumn.com" : "http://localhost:3099");
	const chatServerUrl =
		process.env.CHAT_SERVER_URL ??
		(isProduction ? "https://chat.useautumn.com" : "http://localhost:3099");

	const bases = [
		getAutumnEnv().AUTUMN_API_URL,
		mcpServerUrl,
		chatServerUrl,
	].filter((base): base is string => Boolean(base));

	return [
		...new Set([
			...bases.flatMap((base) =>
				MCP_RESOURCE_PATHS.map((path) => new URL(path, base).href),
			),
			...getConfiguredMcpResourceUrls(),
		]),
	];
};

/** Every resource identifier this authorization server will stamp on a grant. */
export const getOAuthValidAudiences = (): string[] => [
	...new Set(
		[getAutumnEnv().AUTUMN_API_URL, ...getMcpOAuthResourceUrls()].filter(
			(audience): audience is string => Boolean(audience),
		),
	),
];
