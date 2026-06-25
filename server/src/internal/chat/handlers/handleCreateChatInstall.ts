import {
	AppEnv,
	DEFAULT_OAUTH_RESOURCE_SCOPES,
	isOAuthResourceScope,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ChatService } from "../ChatService.js";
import { slackProvider } from "../chatUtils.js";

const installBody = z.strictObject({
	provider: z.literal(slackProvider),
	env: z.enum(AppEnv).optional(),
	// Autumn scopes to grant the bot; empty/omitted = full default set.
	scopes: z.array(z.string()).optional(),
});

const resolveAgentScopes = (scopes?: string[]) => {
	if (!scopes || scopes.length === 0) return [...DEFAULT_OAUTH_RESOURCE_SCOPES];
	return scopes.filter(isOAuthResourceScope);
};

export const handleCreateChatInstall = createRoute({
	scopes: [Scopes.Organisation.Write, Scopes.ApiKeys.Write],
	body: installBody,
	handler: async (c) => {
		const { env, scopes } = c.req.valid("json");
		const url = ChatService.createInstallUrl(
			c.get("ctx"),
			env,
			resolveAgentScopes(scopes),
		);

		return c.json({ url });
	},
});
