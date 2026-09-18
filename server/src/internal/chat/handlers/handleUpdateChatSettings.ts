import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ChatService } from "../ChatService.js";
import { slackProvider } from "../chatUtils.js";

const providerParam = z.literal(slackProvider);

const settingsBody = z.strictObject({
	require_mention: z.boolean(),
});

export const handleUpdateChatSettings = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: settingsBody,
	handler: async (c) => {
		providerParam.parse(c.req.param("provider"));
		const { require_mention } = c.req.valid("json");
		const updated = await ChatService.updateSettings(c.get("ctx"), {
			requireMention: require_mention,
		});
		if (!updated) {
			throw new RecaseError({
				message: "Connect Slack before changing its settings.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		return c.json({ success: true, require_mention });
	},
});
