import { z } from "zod/v4";

export const SLACK_BOT_IDENTIFIER_REGEX = /^[UWB][A-Z0-9]{2,}$/;

export const MAX_CHAT_TRUSTED_BOTS = 20;

export const ChatTrustedBotSchema = z.object({
	slack_id: z.string().regex(SLACK_BOT_IDENTIFIER_REGEX),
	name: z.string().trim().min(1).max(80),
	run_as_user_id: z.string().min(1),
	added_by_user_id: z.string().nullable(),
	added_at: z.number(),
});

export type ChatTrustedBot = z.infer<typeof ChatTrustedBotSchema>;

export const ChatTrustedBotInputSchema = ChatTrustedBotSchema.pick({
	slack_id: true,
	name: true,
	run_as_user_id: true,
});

export type ChatTrustedBotInput = z.infer<typeof ChatTrustedBotInputSchema>;
