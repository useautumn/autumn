import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ChatService } from "../ChatService.js";
import { slackProvider } from "../chatUtils.js";

const providerParam = z.literal(slackProvider);

export const handleDisconnectChat = createRoute({
	scopes: [Scopes.Organisation.Write, Scopes.ApiKeys.Write],
	handler: async (c) => {
		providerParam.parse(c.req.param("provider"));
		await ChatService.disconnect(c.get("ctx"));

		return c.json({ success: true });
	},
});
