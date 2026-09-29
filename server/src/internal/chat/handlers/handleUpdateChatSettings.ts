import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { CHAT_REPLY_MODES } from "@autumn/shared/models/chatModels/chatEnums";
import {
	ChatTrustedBotInputSchema,
	MAX_CHAT_TRUSTED_BOTS,
} from "@autumn/shared/models/chatModels/chatTrustedBots";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ChatService } from "../ChatService.js";
import { slackProvider } from "../chatUtils.js";

const providerParam = z.literal(slackProvider);

const settingsBody = z
	.strictObject({
		reply_mode: z.enum(CHAT_REPLY_MODES).optional(),
		trusted_bots: z
			.array(ChatTrustedBotInputSchema)
			.max(MAX_CHAT_TRUSTED_BOTS)
			.refine(
				(bots) => new Set(bots.map((bot) => bot.slack_id)).size === bots.length,
				{ message: "Each trusted bot can only be added once." },
			)
			.optional(),
	})
	.refine(
		(body) => body.reply_mode !== undefined || body.trusted_bots !== undefined,
		{ message: "Pass reply_mode or trusted_bots." },
	);

export const handleUpdateChatSettings = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: settingsBody,
	handler: async (c) => {
		providerParam.parse(c.req.param("provider"));
		const { reply_mode: replyMode, trusted_bots: trustedBots } =
			c.req.valid("json");
		const updated = await ChatService.updateSettings(c.get("ctx"), {
			replyMode,
			trustedBots,
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
