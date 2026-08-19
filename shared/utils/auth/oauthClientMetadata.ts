import { z } from "zod";

export const MCP_CLIENT_KIND = "mcp_client";

/** Catches per field, so one malformed key cannot blank its siblings. */
const optionalMetadataString = z.string().optional().catch(undefined);

/**
 * Classification keys across every shape rows have been written in: `kind` and
 * `mcpClientType` from the current writers, plus the `client`, `clientType`,
 * `client_type` and `source` variants legacy first-party clients persisted.
 */
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
