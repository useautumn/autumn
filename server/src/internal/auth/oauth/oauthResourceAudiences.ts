import { getAutumnEnv } from "@autumn/env";
import { logger } from "@/external/logtail/logtailUtils.js";

const MCP_RESOURCE_PATH = "/mcp";
const LOCAL_MCP_SERVER_URL = "http://localhost:3099";
const PRODUCTION_MCP_SERVER_URL = "https://mcp.useautumn.com";
const PRODUCTION_CHAT_SERVER_URL = "https://chat.useautumn.com";

// Reading these here rather than through @autumn/env is deliberate: the typed
// env throws for the whole process on a bad value, and an MCP-only override is
// not worth failing every other service's boot over.
const getServerUrl = ({
	configured,
	productionUrl,
}: {
	configured: string | undefined;
	productionUrl: string;
}) => {
	if (configured) return configured;
	return process.env.NODE_ENV === "production"
		? productionUrl
		: LOCAL_MCP_SERVER_URL;
};

// A malformed entry is dropped rather than fatal, so it has to be visible; the
// raw value is the identity, so a stable misconfiguration warns once.
const warnedResourceUrls = new Set<string>();

const parseMcpResourceUrl = (rawUrl: string) => {
	const resourceUrl = rawUrl.trim();
	if (!resourceUrl) return null;
	if (URL.canParse(resourceUrl)) return new URL(resourceUrl).href;

	if (!warnedResourceUrls.has(resourceUrl)) {
		warnedResourceUrls.add(resourceUrl);
		logger.warn("Ignoring invalid MCP_RESOURCE_URLS entry", { resourceUrl });
	}
	return null;
};

const getConfiguredMcpResourceUrls = () =>
	process.env.MCP_RESOURCE_URLS?.split(",")
		.map(parseMcpResourceUrl)
		.filter((url): url is string => url !== null) ?? [];

/**
 * Every public host serving an OAuth-protected `/mcp` endpoint, plus the
 * explicit `MCP_RESOURCE_URLS` override. The `resource` indicator is host-based,
 * so each host must be a registered audience or its grants authenticate nowhere.
 *
 * Read per call so importing this module never requires env to be loaded yet.
 */
export const getMcpOAuthResourceUrls = (): string[] => {
	const bases = [
		getAutumnEnv().AUTUMN_API_URL,
		getServerUrl({
			configured: process.env.MCP_SERVER_URL,
			productionUrl: PRODUCTION_MCP_SERVER_URL,
		}),
		getServerUrl({
			configured: process.env.CHAT_SERVER_URL,
			productionUrl: PRODUCTION_CHAT_SERVER_URL,
		}),
	];

	return [
		...new Set([
			...bases.map((base) => new URL(MCP_RESOURCE_PATH, base).href),
			...getConfiguredMcpResourceUrls(),
		]),
	];
};

/** Every resource identifier this authorization server will stamp on a grant. */
export const getOAuthValidAudiences = (): string[] => [
	...new Set([getAutumnEnv().AUTUMN_API_URL, ...getMcpOAuthResourceUrls()]),
];
