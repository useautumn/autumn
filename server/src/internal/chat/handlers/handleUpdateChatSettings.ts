import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { CHAT_REPLY_MODES } from "@autumn/shared/models/chatModels/chatEnums";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ChatService } from "../ChatService.js";
import { slackProvider } from "../chatUtils.js";

const providerParam = z.literal(slackProvider);

const settingsBody = z.strictObject({
	reply_mode: z.enum(CHAT_REPLY_MODES),
});

export const handleUpdateChatSettings = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: settingsBody,
	handler: async (c) => {
		providerParam.parse(c.req.param("provider"));
		const { reply_mode: replyMode } = c.req.valid("json");
		const updated = await ChatService.updateSettings(c.get("ctx"), {
			replyMode,
		});
		if (!updated) {
			throw new RecaseError({
				message: "Connect Slack before changing its settings.",
				code: ErrCode.InvalidRequest,
				statusCode: 404,
			});
		}

		return c.json({ success: true });
	},
});
