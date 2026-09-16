import { AUTUMN_ADMIN_OAUTH_CLIENT_ID } from "@autumn/auth/oauth";
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";
import { MCP_CLIENT_KIND } from "@autumn/shared/utils/auth/oauthClientMetadata";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { oauthClientRepo } from "@/internal/auth/repos/index.js";
import { generateId } from "@/utils/genUtils.js";

/** Values match leaf's `ensureMcpOAuthClient` for the admin client so the two writers never flip-flop the row. */
const ADMIN_OAUTH_CLIENT_NAME = "Slack Admin";
const ADMIN_REDIRECT_URIS = ["slack://autumn-chat"];
const ADMIN_CLIENT_METADATA = {
	kind: MCP_CLIENT_KIND,
	mcpClientType: "slack_admin",
} as const;

export const ensureAdminOAuthClient = async ({ db }: { db: DrizzleCli }) => {
	const now = new Date();
	const fields = {
		name: ADMIN_OAUTH_CLIENT_NAME,
		redirectUris: ADMIN_REDIRECT_URIS,
		scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
		tokenEndpointAuthMethod: "none",
		grantTypes: ["authorization_code", "refresh_token"],
		responseTypes: ["code"],
		public: true,
		type: "native",
		metadata: ADMIN_CLIENT_METADATA,
		updatedAt: now,
	};

	return oauthClientRepo.upsert({
		db,
		insert: {
			id: generateId("oauth_client"),
			clientId: AUTUMN_ADMIN_OAUTH_CLIENT_ID,
			createdAt: now,
			...fields,
		},
		update: fields,
	});
};
