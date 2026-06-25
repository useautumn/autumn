import type { AutumnLogger } from "@autumn/logging";
import {
	type ChatInstallation,
	chatInstallations,
	organizations,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import {
	type ChatThreadContextRecord,
	type ChatThreadRef,
	chatThreadContextsRepo,
} from "../../../internal/chatThreadContexts/repos/chatThreadContextsRepo.js";
import {
	isSlackAdminInstallation,
	resolveSlackAdminOrg,
	validateSlackAdminAccess,
} from "../../../internal/slackAdmin/access.js";
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

type InstallationContext = ChatInstallation & { org_slug?: string };

type ResolveSlackAdminOrgDeps = {
	getContextByChannelThread: (
		thread: Pick<ChatThreadRef, "channelId" | "threadId">,
	) => Promise<ChatThreadContextRecord | null>;
	getContextByThread: (
		thread: ChatThreadRef,
	) => Promise<ChatThreadContextRecord | null>;
	getInstallationWithOrg: ({
		chatInstallationId,
	}: {
		chatInstallationId: string;
	}) => Promise<InstallationContext | null>;
	resolveOrg: ({
		identifier,
	}: {
		identifier: string;
	}) => Promise<OrgContext | null>;
	selectOrg: typeof selectChatOrg;
	upsertContext: typeof chatThreadContextsRepo.upsert;
	validateAdminAccess: typeof validateSlackAdminAccess;
};

type ResolveSlackAdminOrgResult =
	| {
			admin: false;
			installation: InstallationContext;
			org: OrgContext;
	  }
	| {
			admin: true;
			installation: InstallationContext;
			org: OrgContext;
	  }
	| {
			admin: true;
			blockedText: string;
	  };

type SelectedAdminOrgResult =
	| {
			ok: true;
			targetIdentifier: string;
			targetOrg: OrgContext;
	  }
	| {
			ok: false;
			blockedText: string;
	  };

const firstUserMessageText = ({
	recentMessages,
	text,
}: {
	recentMessages?: ChatContextMessage[];
	text: string;
}) => recentMessages?.find((message) => message.isBot !== true)?.text ?? text;

const hasPriorBotTurn = ({
	recentMessages,
}: {
	recentMessages?: ChatContextMessage[];
}) => recentMessages?.some((message) => message.isBot === true) ?? false;

const isFirstThreadTurn = ({
	recentMessages,
}: {
	recentMessages?: ChatContextMessage[];
}) => (recentMessages?.length ?? 0) <= 1;

const selectAndResolveAdminOrg = async ({
	deps,
	logger,
	recentMessages,
	text,
}: {
	deps: ResolveSlackAdminOrgDeps;
	logger: AutumnLogger;
	recentMessages?: ChatContextMessage[];
	text: string;
}): Promise<SelectedAdminOrgResult> => {
	const targetIdentifier = await deps.selectOrg({
		message: firstUserMessageText({ recentMessages, text }),
		recentMessages,
		logger,
	});
	if (!targetIdentifier) {
		logger.info("Slack admin org selection missing", {
			event: "leaf.slack_admin_org_missing",
		});
		return {
			ok: false,
			blockedText:
				"Please start a new thread with an explicit Autumn org slug or org ID.",
		};
	}

	const targetOrg = await deps.resolveOrg({
		identifier: targetIdentifier,
	});
	if (!targetOrg) {
		logger.info("Slack admin org lookup failed", {
			event: "leaf.slack_admin_org_not_found",
		});
		return {
			ok: false,
			blockedText: `I couldn't find an Autumn org for "${targetIdentifier}". Start a new thread with a valid org slug or ID.`,
		};
	}

	return { ok: true, targetIdentifier, targetOrg };
};

const defaultGetInstallationWithOrg = async ({
	chatInstallationId,
}: {
	chatInstallationId: string;
}): Promise<InstallationContext | null> => {
	const [row] = await db
		.select({
			installation: chatInstallations,
			orgSlug: organizations.slug,
		})
		.from(chatInstallations)
		.innerJoin(organizations, eq(organizations.id, chatInstallations.org_id))
		.where(eq(chatInstallations.id, chatInstallationId))
		.limit(1);
	if (!row) return null;
	return { ...row.installation, org_slug: row.orgSlug };
};

const defaultResolveSlackAdminOrgDeps: ResolveSlackAdminOrgDeps = {
	getContextByChannelThread: ({ channelId, threadId }) =>
		chatThreadContextsRepo.getUnambiguousByChannelThread({
			db,
			channelId,
			threadId,
		}),
	getContextByThread: ({ channelId, threadId, workspaceId }) =>
		chatThreadContextsRepo.getByThread({
			db,
			channelId,
			threadId,
			workspaceId,
		}),
	getInstallationWithOrg: defaultGetInstallationWithOrg,
	resolveOrg: async ({ identifier }) =>
		(await resolveSlackAdminOrg({ identifier })) ?? null,
	selectOrg: selectChatOrg,
	upsertContext: chatThreadContextsRepo.upsert,
	validateAdminAccess: validateSlackAdminAccess,
};

export const resolveSlackAdminOrgContext = async ({
	deps = defaultResolveSlackAdminOrgDeps,
	installation,
	logger,
	providerUserId,
	recentMessages,
	text,
	thread,
}: {
	deps?: ResolveSlackAdminOrgDeps;
	installation: InstallationContext;
	logger: AutumnLogger;
	providerUserId: string;
	recentMessages?: ChatContextMessage[];
	text: string;
	thread: Thread;
}): Promise<ResolveSlackAdminOrgResult> => {
	if (!isSlackAdminInstallation({ installation })) {
		if (isFirstThreadTurn({ recentMessages })) {
			await deps.upsertContext({
				db,
				channelId: thread.channelId,
				chatInstallationId: installation.id,
				orgId: installation.org_id,
				orgSlug: installation.org_slug,
				providerUserId,
				source: "installation",
				threadId: thread.threadId,
				workspaceId: thread.workspaceId,
			});
		}
		return {
			admin: false,
			installation,
			org: {
				id: installation.org_id,
				slug: installation.org_slug ?? undefined,
			},
		};
	}

	const access = deps.validateAdminAccess({
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

	const exactContext = await deps.getContextByThread(thread);
	const threadContext =
		exactContext ??
		(await deps.getContextByChannelThread({
			channelId: thread.channelId,
			threadId: thread.threadId,
		}));
	if (threadContext) {
		const lockedInstallation = await deps.getInstallationWithOrg({
			chatInstallationId: threadContext.chatInstallationId,
		});
		if (lockedInstallation) {
			logger.info("Resolved Slack thread context", {
				event: "leaf.chat_thread_context_resolved",
				context: { org_id: threadContext.orgId },
				data: { source: threadContext.source },
			});
			return {
				admin: true,
				installation: lockedInstallation,
				org: { id: threadContext.orgId, slug: threadContext.orgSlug },
			};
		}
		logger.warn("Slack thread context installation missing", {
			event: "leaf.chat_thread_context_installation_missing",
			data: { chat_installation_id: threadContext.chatInstallationId },
		});
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

	const selectedOrg = await selectAndResolveAdminOrg({
		deps,
		logger,
		recentMessages,
		text,
	});
	if (!selectedOrg.ok) {
		return {
			admin: true,
			blockedText: selectedOrg.blockedText,
		};
	}

	const adminThread = await deps.upsertContext({
		db,
		channelId: thread.channelId,
		chatInstallationId: installation.id,
		orgId: selectedOrg.targetOrg.id,
		orgSlug: selectedOrg.targetOrg.slug,
		providerUserId,
		source: "admin_selection",
		targetIdentifier: selectedOrg.targetIdentifier,
		threadId: thread.threadId,
		workspaceId: thread.workspaceId,
	});

	return {
		admin: true,
		installation,
		org: { id: adminThread.orgId, slug: adminThread.orgSlug },
	};
};
