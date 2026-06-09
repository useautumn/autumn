import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { registerMcpOAuthClient } from "@/internal/auth/actions/index.js";
import { createRoute } from "../../honoMiddlewares/routeHandler";

const getClientUrl = () =>
	(process.env.CLIENT_URL || "http://localhost:3000").replace(/\/+$/, "");

const getSlackMcpRedirectUris = () => {
	const clientUrl = getClientUrl();
	return [
		`${clientUrl}/admin/oauth/slack-mcp/callback`,
		`${clientUrl}/sandbox/admin/oauth/slack-mcp/callback`,
	];
};

export const handleUpsertSlackMcpOAuthClient = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const { db } = c.get("ctx");
		const result = await registerMcpOAuthClient({
			db,
			clientName: "Slack MCP",
			redirectUris: getSlackMcpRedirectUris(),
			scope: undefined,
		});

		if ("error" in result) {
			throw new RecaseError({
				message: result.error,
				code: ErrCode.InvalidRequest,
				statusCode: result.status,
			});
		}

		return c.json(result.body, result.status);
	},
});
