import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ChatService } from "../ChatService.js";

export const handleGetChat = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		return c.json({
			installations: await ChatService.listInstallations(c.get("ctx")),
		});
	},
});
