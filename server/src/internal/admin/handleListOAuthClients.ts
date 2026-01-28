import { oauthClient } from "@autumn/shared";
import { desc } from "drizzle-orm";
import { createRoute } from "../../honoMiddlewares/routeHandler";

export const handleListOAuthClients = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db } = ctx;

		const clients = await db
			.select({
				id: oauthClient.id,
				clientId: oauthClient.clientId,
				name: oauthClient.name,
				redirectUris: oauthClient.redirectUris,
				public: oauthClient.public,
				disabled: oauthClient.disabled,
				skipConsent: oauthClient.skipConsent,
				scopes: oauthClient.scopes,
				tokenEndpointAuthMethod: oauthClient.tokenEndpointAuthMethod,
				grantTypes: oauthClient.grantTypes,
				responseTypes: oauthClient.responseTypes,
				createdAt: oauthClient.createdAt,
				updatedAt: oauthClient.updatedAt,
			})
			.from(oauthClient)
			.orderBy(desc(oauthClient.createdAt));

		return c.json({
			clients: clients.map((client) => ({
				id: client.id,
				client_id: client.clientId,
				client_name: client.name,
				redirect_uris: client.redirectUris,
				public: client.public,
				disabled: client.disabled,
				skip_consent: client.skipConsent,
				scope: client.scopes?.join(" "),
				token_endpoint_auth_method: client.tokenEndpointAuthMethod,
				grant_types: client.grantTypes,
				response_types: client.responseTypes,
				client_id_issued_at: client.createdAt
					? Math.floor(client.createdAt.getTime() / 1000)
					: undefined,
			})),
		});
	},
});
