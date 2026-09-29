import { z } from "zod/v4";

/** A Slack member id (`U…`/`W…`) or bot id (`B…`). Either identifies the bot;
 * members copy the former from the bot's profile. */
export const SLACK_BOT_IDENTIFIER_REGEX = /^[UWB][A-Z0-9]{2,}$/;

export const MAX_CHAT_TRUSTED_BOTS = 20;

/** Another Slack app whose @-mentions the agent answers as if a person sent
 * them. Its turns run with the permissions of `run_as_user_id`, re-checked on
 * every turn; approvals still need a human click. */
export const ChatTrustedBotSchema = z.object({
	slack_id: z.string().regex(SLACK_BOT_IDENTIFIER_REGEX),
	name: z.string().trim().min(1).max(80),
	run_as_user_id: z.string().min(1),
	added_by_user_id: z.string().nullable(),
	added_at: z.number(),
});

export type ChatTrustedBot = z.infer<typeof ChatTrustedBotSchema>;

/** What the dashboard sends; who added it and when are stamped server-side. */
export const ChatTrustedBotInputSchema = ChatTrustedBotSchema.pick({
	slack_id: true,
	name: true,
	run_as_user_id: true,
});

export type ChatTrustedBotInput = z.infer<typeof ChatTrustedBotInputSchema>;
