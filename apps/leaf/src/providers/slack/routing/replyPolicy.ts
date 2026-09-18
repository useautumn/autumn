import type { ChatInstallation } from "@autumn/shared";
import type { Message } from "chat";
import { slackMessageMentionsUser } from "../events.js";

/** Whether a message in a subscribed thread addresses the bot. The chat SDK
 * flags Slack `app_mention` events; the raw text check covers messages the
 * SDK did not flag but that still carry the bot's <@id> mention. */
const messageMentionsBot = ({
	installation,
	message,
}: {
	installation: Pick<ChatInstallation, "bot_user_id">;
	message: Pick<Message, "isMention" | "raw">;
}) => {
	if (message.isMention === true) return true;
	// Without a bot user id there is no way to tell; fall back to answering.
	if (!installation.bot_user_id) return true;
	return slackMessageMentionsUser({
		raw: message.raw,
		userId: installation.bot_user_id,
	});
};

/** True when the installation is in mention-only mode and this thread reply
 * does not @-mention the bot, so the bot should stay silent. */
export const shouldIgnoreUnmentionedReply = ({
	installation,
	message,
}: {
	installation: Pick<ChatInstallation, "bot_user_id" | "require_mention">;
	message: Pick<Message, "isMention" | "raw">;
}) => {
	if (!installation.require_mention) return false;
	return !messageMentionsBot({ installation, message });
};
