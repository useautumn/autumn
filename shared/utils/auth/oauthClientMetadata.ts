export const MCP_CLIENT_KIND = "mcp_client";

export type OAuthClientMetadata = {
	kind?: string;
	mcpClientType?: string;
	redirectNames?: Record<string, string>;
};

const asMetadataObject = (value: unknown): OAuthClientMetadata =>
	value && typeof value === "object" ? (value as OAuthClientMetadata) : {};

/** Metadata is jsonb, but legacy rows persisted it as a JSON string. */
export const parseOAuthClientMetadata = (
	metadata: unknown,
): OAuthClientMetadata => {
	if (!metadata) return {};
	if (typeof metadata !== "string") return asMetadataObject(metadata);

	try {
		return asMetadataObject(JSON.parse(metadata));
	} catch {
		return {};
	}
};

export const isMcpClientMetadata = (metadata: unknown) =>
	parseOAuthClientMetadata(metadata).kind === MCP_CLIENT_KIND;
