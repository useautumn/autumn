import {
	AppEnv,
	DEFAULT_OAUTH_RESOURCE_SCOPES,
	oauthAccessToken,
	oauthClient,
	oauthConsent,
} from "@autumn/shared";
import { hashOAuthToken } from "@autumn/shared/utils/auth/oauthAccessTokens";
import { MCP_CLIENT_KIND } from "@autumn/shared/utils/auth/oauthClientMetadata";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { addHours } from "date-fns";
import { eq } from "drizzle-orm";
import { ensureSlackMcpOAuthClient } from "@/internal/auth/oauth/slackMcpOAuthClient.js";
import { generateId } from "@/utils/genUtils.js";

/** An OAuth access token for `clientId`, issued to `userId` on the test org, as Leaf mints them. */
export const mintOAuthAccessToken = async ({
	ctx,
	clientId,
	userId,
}: {
	ctx: TestContext;
	/** The Slack MCP client is upserted; any other id gets a throwaway client. */
	clientId: string;
	userId: string;
}) => {
	const isSlackClient = clientId === "autumn_mcp_slack";
	if (isSlackClient) {
		await ensureSlackMcpOAuthClient({ db: ctx.db });
	} else {
		await ctx.db.insert(oauthClient).values({
			id: generateId("oauth_client"),
			clientId,
			name: "Approvals test client",
			redirectUris: ["http://127.0.0.1/callback"],
			scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			metadata: { kind: MCP_CLIENT_KIND, mcpClientType: "dynamic" },
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	}

	const consentId = generateId("oauth_consent");
	await ctx.db.insert(oauthConsent).values({
		id: consentId,
		clientId,
		userId,
		referenceId: ctx.org.id,
		scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
		env: AppEnv.Sandbox,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	const token = generateId("access");
	await ctx.db.insert(oauthAccessToken).values({
		id: generateId("oauth_access"),
		token: hashOAuthToken(token),
		clientId,
		userId,
		referenceId: ctx.org.id,
		oauthConsentId: consentId,
		expiresAt: addHours(new Date(), 1),
		createdAt: new Date(),
		scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
	});

	const cleanup = async () => {
		await ctx.db.delete(oauthConsent).where(eq(oauthConsent.id, consentId));
		if (!isSlackClient) {
			await ctx.db
				.delete(oauthClient)
				.where(eq(oauthClient.clientId, clientId));
		}
	};
	return { token: `am_sk_test_oauth_${token}`, cleanup };
};
