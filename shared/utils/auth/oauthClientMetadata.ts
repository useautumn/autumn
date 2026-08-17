import { z } from "zod";

export const MCP_CLIENT_KIND = "mcp_client";

/** Anything that is not an object with these fields reads as unclassified metadata. */
const oauthClientMetadataSchema = z
	.object({
		kind: z.string().optional(),
		mcpClientType: z.string().optional(),
	})
	.catch({});

export type OAuthClientMetadata = z.infer<typeof oauthClientMetadataSchema>;

/** Metadata is jsonb, but legacy rows persisted it as a JSON string. */
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
