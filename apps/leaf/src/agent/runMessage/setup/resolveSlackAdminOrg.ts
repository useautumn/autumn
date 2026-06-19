import type { AutumnLogger } from "@autumn/logging";
import type { ChatInstallation } from "@autumn/shared";
import {
	isSlackAdminInstallation,
	resolveSlackAdminOrg,
	validateSlackAdminAccess,
} from "../../../internal/slackAdmin/access.js";
import { slackAdminThreadsRepo } from "../../../internal/slackAdmin/repos/slackAdminThreadsRepo.js";
import { db } from "../../../lib/db.js";
import type { ChatContextMessage } from "../../../types.js";
import { selectChatOrg } from "./selectChatOrg.js";

type Thread = {
	channelId: string;
	threadId: string;
	workspaceId: string;
};

type OrgContext = {
	id: string;
	slug?: string;
};

type ResolveSlackAdminOrgResult =
	| {
			admin: false;
			org: OrgContext;
	  }
	| {
			admin: true;
			org: OrgContext;
	  }
	| {
			admin: true;
			blockedText: string;
	  };

const firstUserMessageText = ({
	recentMessages,
	text,
}: {
	recentMessages?: ChatContextMessage[];
	text: string;
}) => recentMessages?.find((message) => message.isBot !== true)?.text ?? text;

const hasPriorBotTurn = ({ recentMessages }: { recentMessages?: ChatContextMessage[] }) =>
	recentMessages?.some((message) => message.isBot === true) ?? false;

export const resolveSlackAdminOrgContext = async ({
	installation,
	logger,
	providerUserId,
	recentMessages,
	text,
	thread,
}: {
	installation: ChatInstallation & { org_slug?: string };
	logger: AutumnLogger;
	providerUserId: string;
	recentMessages?: ChatContextMessage[];
	text: string;
	thread: Thread;
}): Promise<ResolveSlackAdminOrgResult> => {
	if (!isSlackAdminInstallation({ installation })) {
		return {
			admin: false,
			org: {
				id: installation.org_id,
				slug: installation.org_slug ?? undefined,
			},
		};
	}

	const access = validateSlackAdminAccess({
		workspaceId: thread.workspaceId,
	});
	if (!access.allowed) {
		logger.warn("Slack admin access denied", {
			event: "leaf.slack_admin_access_denied",
			data: { reason: access.reason },
		});
		return {
			admin: true,
			blockedText:
				"This Slack user is not authorized to use the Autumn admin bot.",
		};
	}

	const existingThread = await slackAdminThreadsRepo.getByThread({
		db,
		channelId: thread.channelId,
		threadId: thread.threadId,
		workspaceId: thread.workspaceId,
	});
	if (existingThread) {
		return {
			admin: true,
			org: { id: existingThread.orgId, slug: existingThread.orgSlug },
		};
	}

	if (hasPriorBotTurn({ recentMessages })) {
		logger.warn("Slack admin thread lock missing for follow-up", {
			event: "leaf.slack_admin_thread_lock_missing",
		});
		return {
			admin: true,
			blockedText:
				"Please start a new thread with an explicit Autumn org slug or org ID.",
		};
	}

	const targetIdentifier = await selectChatOrg({
		message: firstUserMessageText({ recentMessages, text }),
		recentMessages,
		logger,
	});
	if (!targetIdentifier) {
		logger.info("Slack admin org selection missing", {
			event: "leaf.slack_admin_org_missing",
		});
		return {
			admin: true,
			blockedText:
				"Please start a new thread with an explicit Autumn org slug or org ID.",
		};
	}

	const targetOrg = await resolveSlackAdminOrg({ identifier: targetIdentifier });
	if (!targetOrg) {
		logger.info("Slack admin org lookup failed", {
			event: "leaf.slack_admin_org_not_found",
		});
		return {
			admin: true,
			blockedText: `I couldn't find an Autumn org for "${targetIdentifier}". Start a new thread with a valid org slug or ID.`,
		};
	}

	const adminThread = await slackAdminThreadsRepo.upsert({
		db,
		channelId: thread.channelId,
		chatInstallationId: installation.id,
		orgId: targetOrg.id,
		orgSlug: targetOrg.slug,
		providerUserId,
		targetIdentifier,
		threadId: thread.threadId,
		workspaceId: thread.workspaceId,
	});

	return {
		admin: true,
		org: { id: adminThread.orgId, slug: adminThread.orgSlug },
	};
};
