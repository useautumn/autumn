import { Scopes } from "@autumn/shared";
import { oauthClientRepo } from "@/internal/auth/repos/index.js";
import { createRoute } from "../../honoMiddlewares/routeHandler";

export const handleListOAuthClients = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db } = ctx;

		const clients = await oauthClientRepo.listForAdmin({ db });

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
