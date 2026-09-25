import { ChatReplyMode } from "@autumn/shared";
import type { Message, Thread } from "chat";
import { getRun, runKeyForThread } from "../../../internal/runs/runRegistry.js";
import { logger } from "../../../lib/logger.js";
import { getSlackWorkspaceId } from "../context.js";
import { slackMessageMentionsUser } from "../events.js";
import { findSlackInstallationForWorkspace } from "../installations.js";
import { controlMessageFrom } from "./controlMessage.js";

/** The author's own run is still live, so an untagged correction ("actually
 * make it $20") reaches it as a follow-up instead of being dropped. */
const authorOwnsLiveRun = ({
	message,
	thread,
	workspaceId,
}: {
	message: Message;
	thread: Thread;
	workspaceId: string;
}) => {
	const active = getRun(
		runKeyForThread({
			channelId: thread.channelId,
			provider: "slack",
			threadId: thread.id,
			workspaceId,
		}),
	);
	if (!active || active.closed || active.stop || active.settling) return false;
	return active.ownerProviderUserId === message.author.userId;
};

/** In a mentions-only workspace, a reply in a joined thread that does not
 * @-mention the agent is left alone. Control commands ("stop") and the run
 * owner's mid-run follow-ups always get through. Any doubt (no workspace id,
 * lookup failure) falls back to replying, the default behaviour. */
export const shouldSkipUntaggedReply = async ({
	findInstallation = findSlackInstallationForWorkspace,
	message,
	thread,
}: {
	findInstallation?: typeof findSlackInstallationForWorkspace;
	message: Message;
	thread: Thread;
}): Promise<boolean> => {
	if (controlMessageFrom(message.text)) return false;
	try {
		const workspaceId = getSlackWorkspaceId(message.raw);
		const installation = await findInstallation({
			workspaceId,
		});
		if (installation?.reply_mode !== ChatReplyMode.MentionsOnly) return false;
		if (
			slackMessageMentionsUser({
				raw: message.raw,
				userId: installation.bot_user_id,
			})
		) {
			return false;
		}
		return !authorOwnsLiveRun({ message, thread, workspaceId });
	} catch (error) {
		logger.warn("Could not resolve Slack reply mode; replying", {
			event: "leaf.slack_reply_mode_failed",
			data: { error },
		});
		return false;
	}
};
