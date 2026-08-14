import type { ChatInstallation } from "@autumn/shared";
import { runEveMessage } from "../../harness/eve/engine.js";
import { findEveSessionForThread } from "../../harness/eve/repo.js";
import { getInstallationOAuthAccessToken } from "../../internal/installations/actions/getInstallationOAuthAccessToken.js";
import { MESSAGE_TIMEOUT_MS } from "../../lib/chatAgentConfig.js";
import { db } from "../../lib/db.js";
import { logger as rootLogger } from "../../lib/logger.js";
import type { AgentOutput, BotMessage } from "../../types.js";
import { prepareAttachmentMessage } from "./setup/prepareAttachments.js";
import { resolveSlackAdminOrgContext } from "./setup/resolveSlackAdminOrg.js";
import { resolveSlackCallerAuth } from "./setup/resolveSlackCallerAuth.js";
import { getDefaultChatEnv, selectChatEnv } from "./setup/selectChatEnv.js";
import type { MessageContext, MessageParams } from "./types.js";

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
	new Promise<T>((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error("Chat agent timed out")),
			ms,
		);
		promise.then(resolve, reject).finally(() => clearTimeout(timeout));
	});

const TIMEOUT_BACKSTOP_GRACE_MS = 20_000;

type RunMessageOutput = AgentOutput & {
	installation?: ChatInstallation;
	org?: { id: string; slug?: string };
};

/** Entry point for one chat message: staged ctx build, then engine dispatch. */
export const runMessage = async ({
	agentRunId,
	attachmentFetchFallback,
	attachments,
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
	channelId,
	threadId,
}: BotMessage): Promise<RunMessageOutput> => {
	const deadlineAt = Date.now() + MESSAGE_TIMEOUT_MS;
	return withTimeout(
		(async () => {
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
				return { env: getDefaultChatEnv(), text: orgContext.blockedText };
			}
			const effectiveInstallation = orgContext.installation;
			const { org } = orgContext;
			const effectiveThread = {
				channelId,
				provider: effectiveInstallation.provider,
				threadId,
				workspaceId: effectiveInstallation.workspace_id,
			};

			// Admin installs act as Autumn staff, never as org members.
			let autumnUserId: string | undefined;
			if (!orgContext.admin) {
				const callerAuth = await resolveSlackCallerAuth({
					installation: effectiveInstallation,
					logger,
					orgId: org.id,
					slackUserId: providerUserId,
				});
				if (callerAuth.usePerUser && !callerAuth.ok) {
					return {
						env: getDefaultChatEnv(),
						text: callerAuth.text,
					};
				}
				if (callerAuth.usePerUser) {
					autumnUserId = callerAuth.userId;
				}
			}

			const preparedPromise = prepareAttachmentMessage({
				attachments,
				fetchFallback: attachmentFetchFallback,
				logger,
				text,
			});
			const existingSessionPromise = findEveSessionForThread({
				db,
				orgId: org.id,
				thread: effectiveThread,
			});

			const [prepared, existingSession] = await Promise.all([
				preparedPromise,
				existingSessionPromise,
			]);
			const params: MessageParams = {
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
					message: prepared.envSelectionText,
					recentMessages,
					logger,
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

			// Legacy/admin installs resolve no per-user id; fall back to the
			// installer's credential.
			const tokenUserId =
				autumnUserId ?? effectiveInstallation.installed_by_user_id;
			if (!tokenUserId) {
				throw new Error(
					"Missing installer user id for chat MCP OAuth credentials",
				);
			}
			const token = await getInstallationOAuthAccessToken({
				installation: effectiveInstallation,
				env,
				orgId: org.id,
				userId: tokenUserId,
			});

			const ctx: MessageContext = {
				autumnUserId,
				eveSession: existingSession,
				env,
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

			const output = await runEveMessage({ ctx, params });
			return { ...output, installation: effectiveInstallation, org };
		})(),
		deadlineAt - Date.now() + TIMEOUT_BACKSTOP_GRACE_MS,
	);
};
