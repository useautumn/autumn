import type {
	AgentTurnContext,
	AgentTurnParams,
} from "../../../internal/agentRuntime/domain/agentTurnContext.js";
import { findEveSessionForThread } from "../../../internal/agentRuntime/eve/repo.js";
import { getInstallationOAuthAccessToken } from "../../../internal/installations/actions/getInstallationOAuthAccessToken.js";
import { db } from "../../../lib/db.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import type { SlackAgentTurnParams } from "../domain/slackAgentTurn.js";
import { prepareAttachmentMessage } from "./prepareAttachments.js";
import { resolveSlackAdminOrgContext } from "./resolveSlackAdminOrg.js";
import { resolveSlackCallerAuth } from "./resolveSlackCallerAuth.js";
import { getDefaultChatEnv, selectChatEnv } from "./selectChatEnv.js";

export const setupSlackAgentTurn = async ({
	agentRunId,
	attachmentFetchFallback,
	attachments,
	channelId,
	clientContext,
	installation,
	logger = rootLogger,
	onAction,
	onApprovalsSuperseded,
	onReasoning,
	onThinking,
	providerUserId,
	recentMessages,
	run,
	text,
	threadId,
}: SlackAgentTurnParams) => {
	const thread = {
		channelId,
		provider: installation.provider,
		threadId,
		workspaceId: installation.workspace_id,
	};
	const orgContext = await resolveSlackAdminOrgContext({
		installation,
		logger,
		providerUserId,
		recentMessages,
		text,
		thread,
	});
	if ("blockedText" in orgContext) {
		return {
			env: getDefaultChatEnv(),
			kind: "blocked",
			text: orgContext.blockedText,
		} as const;
	}

	const effectiveInstallation = orgContext.installation;
	const { org } = orgContext;
	const effectiveThread = {
		channelId,
		provider: effectiveInstallation.provider,
		threadId,
		workspaceId: effectiveInstallation.workspace_id,
	};
	const callerAuth = orgContext.admin
		? ({ usePerUser: false } as const)
		: await resolveSlackCallerAuth({
				installation: effectiveInstallation,
				logger,
				orgId: org.id,
				slackUserId: providerUserId,
			});
	if (callerAuth.usePerUser && !callerAuth.ok) {
		return {
			env: getDefaultChatEnv(),
			kind: "blocked",
			text: callerAuth.text,
		} as const;
	}
	const autumnUserId = callerAuth.usePerUser ? callerAuth.userId : undefined;

	const [prepared, existingSession] = await Promise.all([
		prepareAttachmentMessage({
			attachments,
			fetchFallback: attachmentFetchFallback,
			logger,
			text,
		}),
		findEveSessionForThread({
			db,
			orgId: org.id,
			thread: effectiveThread,
		}),
	]);
	const turnParams: AgentTurnParams = {
		attachments: prepared.parts.map((part) => ({
			data: part.data,
			mimeType: part.mediaType,
			name: part.filename,
		})),
		clientContext,
		recentMessages,
		text: prepared.userText,
	};
	const env =
		existingSession?.env ??
		(await selectChatEnv({
			logger,
			message: prepared.envSelectionText,
			recentMessages,
		}));
	logger.info("Selected chat environment", {
		event: "leaf.chat_env_selected",
		context: {
			env,
			org_id: org.id,
			provider: effectiveInstallation.provider,
		},
		data: {
			source: existingSession ? "existing_session" : "selector",
		},
	});

	const tokenUserId =
		autumnUserId ?? effectiveInstallation.installed_by_user_id;
	if (!tokenUserId) {
		throw new Error("Missing installer user id for chat MCP OAuth credentials");
	}
	const token = await getInstallationOAuthAccessToken({
		env,
		installation: effectiveInstallation,
		orgId: org.id,
		userId: tokenUserId,
	});
	const context: AgentTurnContext = {
		autumnUserId,
		env,
		eveSession: existingSession,
		id: agentRunId ?? crypto.randomUUID(),
		logger,
		onAction,
		onApprovalsSuperseded,
		onReasoning,
		onThinking,
		org,
		providerUserId,
		run,
		thread: effectiveThread,
		timestamp: Date.now(),
		token,
	};

	return {
		context,
		installation: effectiveInstallation,
		kind: "ready",
		org,
		params: turnParams,
	} as const;
};
