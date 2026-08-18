import { z } from "zod";

export const MCP_CLIENT_KIND = "mcp_client";

/**
 * Client classification keys, across every shape rows have been written in:
 * `kind`/`mcpClientType` from the current writers, plus the `client`,
 * `clientType`, `client_type` and `source` variants legacy first-party clients
 * persisted. Each field catches on its own so one malformed key cannot blank
 * its siblings; anything that is not an object reads as unclassified.
 */
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
