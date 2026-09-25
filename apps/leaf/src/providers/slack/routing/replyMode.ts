import { ChatReplyMode, chatInstallations } from "@autumn/shared";
import type { Message, Thread } from "chat";
import { eq } from "drizzle-orm";
import { chatThreadContextsRepo } from "../../../internal/chatThreadContexts/repos/chatThreadContextsRepo.js";
import { getRun, runKeyForThread } from "../../../internal/runs/runRegistry.js";
import { isInternalAutumnSlackProvider } from "../../../internal/slackAdmin/provider.js";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { getSlackWorkspaceId } from "../context.js";
import { slackMessageMentionsUser } from "../events.js";
import { findSlackInstallationForWorkspace } from "../installations.js";
import { controlMessageFrom } from "./controlMessage.js";

type ReplyModeInstallation = {
	bot_user_id: string | null;
	provider: string;
	reply_mode: string;
};

/** The installation a thread is locked to, the same lookup the admin path
 * uses to pick the thread's org. */
const findThreadInstallation = async ({
	thread,
	workspaceId,
}: {
	thread: Thread;
	workspaceId: string;
}): Promise<ReplyModeInstallation | undefined> => {
	const ref = { channelId: thread.channelId, threadId: thread.id };
	const context =
		(await chatThreadContextsRepo.getByThread({ db, ...ref, workspaceId })) ??
		(await chatThreadContextsRepo.getUnambiguousByChannelThread({
			db,
			...ref,
		}));
	if (!context) return undefined;
	return await db.query.chatInstallations.findFirst({
		where: eq(chatInstallations.id, context.chatInstallationId),
	});
};

/** An Autumn teammate's reply in a customer's shared channel arrives on the
 * internal admin installation, but the thread belongs to the customer
 * installation it is locked to, so that one's reply mode applies. */
const resolveGoverningInstallation = async ({
	authorInstallation,
	findLockedInstallation,
	thread,
	workspaceId,
}: {
	authorInstallation: ReplyModeInstallation | undefined;
	findLockedInstallation: typeof findThreadInstallation;
	thread: Thread;
	workspaceId: string;
}) => {
	if (
		!authorInstallation ||
		!isInternalAutumnSlackProvider({ provider: authorInstallation.provider })
	) {
		return authorInstallation;
	}
	return (
		(await findLockedInstallation({ thread, workspaceId })) ??
		authorInstallation
	);
};

/** The author's own run is still live, so an untagged correction ("actually
 * make it $20") reaches it instead of being dropped. */
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
	// A settling run still counts: the coordinator queues the correction as
	// the next run instead of injecting it.
	if (!active || active.closed || active.stop) return false;
	return active.ownerProviderUserId === message.author.userId;
};

/** In a mentions-only workspace, a reply in a joined thread that does not
 * @-mention the agent is left alone. Control commands ("stop") and the run
 * owner's mid-run follow-ups always get through. Any doubt (no workspace id,
 * lookup failure) falls back to replying, the default behaviour. */
export const shouldSkipUntaggedReply = async ({
	findInstallation = findSlackInstallationForWorkspace,
	findLockedInstallation = findThreadInstallation,
	message,
	thread,
}: {
	findInstallation?: typeof findSlackInstallationForWorkspace;
	findLockedInstallation?: typeof findThreadInstallation;
	message: Message;
	thread: Thread;
}): Promise<boolean> => {
	if (controlMessageFrom(message.text)) return false;
	try {
		const workspaceId = getSlackWorkspaceId(message.raw);
		const authorInstallation = await findInstallation({ workspaceId });
		const installation = await resolveGoverningInstallation({
			authorInstallation,
			findLockedInstallation,
			thread,
			workspaceId,
		});
		if (installation?.reply_mode !== ChatReplyMode.MentionsOnly) return false;
		// The agent may show up under either installation's bot user. With no
		// bot id to check against, assume it was tagged.
		const botUserIds = [
			installation.bot_user_id,
			authorInstallation?.bot_user_id,
		].filter((userId): userId is string => Boolean(userId));
		if (
			botUserIds.length === 0 ||
			botUserIds.some((userId) =>
				slackMessageMentionsUser({ raw: message.raw, userId }),
			)
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
