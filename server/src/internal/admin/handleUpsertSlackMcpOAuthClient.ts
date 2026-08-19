import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { ensureSlackMcpOAuthClient } from "@/internal/auth/oauth/slackMcpOAuthClient.js";
import { createRoute } from "../../honoMiddlewares/routeHandler";

export const handleUpsertSlackMcpOAuthClient = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const { db } = c.get("ctx");
		const client = await ensureSlackMcpOAuthClient({ db });

		if (!client) {
			throw new RecaseError({
				message: "Failed to provision the Slack MCP OAuth client",
				code: ErrCode.InternalError,
				statusCode: 500,
			});
		}

		return c.json({
			client_id: client.clientId,
			client_name: client.name,
			redirect_uris: client.redirectUris,
			scope: client.scopes?.join(" ") ?? "",
		});
	},
});
