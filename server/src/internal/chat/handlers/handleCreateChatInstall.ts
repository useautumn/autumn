import { AppEnv, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ChatService } from "../ChatService.js";
import { slackProvider } from "../chatUtils.js";

const installBody = z.strictObject({
	provider: z.literal(slackProvider),
	env: z.enum(AppEnv).optional(),
});

export const handleCreateChatInstall = createRoute({
	scopes: [Scopes.Organisation.Write, Scopes.ApiKeys.Write],
	body: installBody,
	handler: async (c) => {
		const { env } = c.req.valid("json");
		const url = ChatService.createInstallUrl(c.get("ctx"), env);

		return c.json({ url });
	},
});
