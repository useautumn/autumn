import type { ChatInstallation, ChatTrustedBot } from "@autumn/shared";

type SlackAuthorIds = { botId?: string; userId?: string };

const slackAuthorIds = (raw: unknown): SlackAuthorIds => {
	if (typeof raw !== "object" || raw === null) return {};
	const { bot_id: botId, user: userId } = raw as Record<string, unknown>;
	return {
		botId: typeof botId === "string" ? botId : undefined,
		userId: typeof userId === "string" ? userId : undefined,
	};
};

/** The installation's trusted bot that posted this raw Slack message, matched
 * on either its member id or its bot id. Only bot-authored messages match, so
 * a person can never pass as a trusted bot. */
export const findTrustedSlackBot = ({
	installation,
	raw,
}: {
	installation?:
		| (Pick<ChatInstallation, "trusted_bots"> &
				Partial<Pick<ChatInstallation, "bot_user_id">>)
		| null;
	raw: unknown;
}): ChatTrustedBot | undefined => {
	const trustedBots = installation?.trusted_bots ?? [];
	if (trustedBots.length === 0) return undefined;
	const { botId, userId } = slackAuthorIds(raw);
	// The agent never answers itself, even if its own id was listed.
	if (!botId || (userId && userId === installation?.bot_user_id)) {
		return undefined;
	}
	return trustedBots.find(
		(bot) => bot.slack_id === botId || bot.slack_id === userId,
	);
};
