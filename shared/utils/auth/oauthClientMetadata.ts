import { z } from "zod";

export const MCP_CLIENT_KIND = "mcp_client";

const optionalMetadataString = z.string().optional().catch(undefined);

const oauthClientMetadataSchema = z
	.object({
		kind: optionalMetadataString,
		mcpClientType: optionalMetadataString,
		client: optionalMetadataString,
		clientType: optionalMetadataString,
		client_type: optionalMetadataString,
		source: optionalMetadataString,
	})
	.catch({});

export type OAuthClientMetadata = z.infer<typeof oauthClientMetadataSchema>;

export const parseOAuthClientMetadata = (
	metadata: unknown,
): OAuthClientMetadata => {
	if (!metadata) return {};
	if (typeof metadata !== "string") {
		return oauthClientMetadataSchema.parse(metadata);
	}

	try {
		return oauthClientMetadataSchema.parse(JSON.parse(metadata));
	} catch {
		return {};
	}
};
