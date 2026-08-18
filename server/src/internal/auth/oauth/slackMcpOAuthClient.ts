import { SLACK_MCP_OAUTH_CLIENT_ID } from "@autumn/auth/oauth";
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";
import { MCP_CLIENT_KIND } from "@autumn/shared/utils/auth/oauthClientMetadata";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import { oauthClientRepo } from "../repos/oauthClientRepo.js";

const SLACK_MCP_OAUTH_CLIENT_NAME = "Slack";

// Leaf mints Slack MCP tokens directly, so this URI is stored but never used.
const SLACK_MCP_REDIRECT_URIS = ["slack://autumn-chat"];

const SLACK_MCP_CLIENT_METADATA = {
	kind: MCP_CLIENT_KIND,
	mcpClientType: "slack",
} as const;

/**
 * Provisions the reserved Slack MCP client. Name/scopes/metadata match leaf's
 * `ensureMcpOAuthClient` so the two writers never flip-flop the row.
 */
export const ensureSlackMcpOAuthClient = async ({ db }: { db: DrizzleCli }) => {
	const now = new Date();

	return oauthClientRepo.upsert({
		db,
		insert: {
			id: generateId("oauth_client"),
			clientId: SLACK_MCP_OAUTH_CLIENT_ID,
			name: SLACK_MCP_OAUTH_CLIENT_NAME,
			redirectUris: SLACK_MCP_REDIRECT_URIS,
			scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			metadata: SLACK_MCP_CLIENT_METADATA,
			createdAt: now,
			updatedAt: now,
		},
		update: {
			name: SLACK_MCP_OAUTH_CLIENT_NAME,
			redirectUris: SLACK_MCP_REDIRECT_URIS,
			scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			metadata: SLACK_MCP_CLIENT_METADATA,
			updatedAt: now,
		},
	});
};
