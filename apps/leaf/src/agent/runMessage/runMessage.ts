import type { ChatInstallation } from "@autumn/shared";
import type { ClaudeManagedSessionRef } from "../../harness/claudeManaged/session/ensureSession.js";
import { findClaudeManagedSessionForThread } from "../../harness/claudeManaged/session/ensureSession.js";
import { getInstallationOAuthAccessToken } from "../../internal/installations/actions/getInstallationOAuthAccessToken.js";
import { messageTimeoutMs } from "../../lib/chatAgentConfig.js";
import { decrypt } from "../../lib/crypto.js";
import { db } from "../../lib/db.js";
import { env as chatEnv } from "../../lib/env.js";
import { logger as rootLogger } from "../../lib/logger.js";
import type { AgentOutput, BotMessage } from "../../types.js";
import { agentEngines } from "./engines/engines.js";
import { prepareAttachmentMessage } from "./setup/prepareAttachments.js";
import { resolveSlackAdminOrgContext } from "./setup/resolveSlackAdminOrg.js";
import { resolveSlackUserAuth } from "./setup/resolveSlackUserAuth.js";
import { getDefaultChatEnv, selectChatEnv } from "./setup/selectChatEnv.js";
import { setupAgentToolContext } from "./setup/setupAgentToolContext.js";
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
	installation,
	logger = rootLogger,
	onAction,
	onActionKeyed,
	onAgentReady,
	onApprovalsSuperseded,
	onThinking,
	onTurnComplete,
	providerUserId,
	recentMessages,
	run,
	text,
	channelId,
	threadId,
}: BotMessage): Promise<RunMessageOutput> => {
	// The engine interrupts the session at the deadline; the wider outer
	// timeout only fires if the stream itself wedges.
	const harness = chatEnv.SLACK_AGENT_HARNESS;
	const deadlineAt = Date.now() + messageTimeoutMs[harness];
	return withTimeout(
		(async () => {
			const engine = agentEngines[harness];
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
				await onAgentReady?.();
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

			// Resolve the Slack sender to their Autumn identity and a per-user
			// scoped token. Admin installs keep the installer-scoped flow (the admin
			// explicitly selects the target org). On any failure we deny here and
			// never fall back to the shared installer token.
			let autumnUserId: string | undefined;
			if (!orgContext.admin) {
				const userAuth = await resolveSlackUserAuth({
					botToken: decrypt(effectiveInstallation.bot_access_token),
					installation: effectiveInstallation,
					logger,
					orgId: org.id,
					slackUserId: providerUserId,
				});
				if (!userAuth.ok) {
					await onAgentReady?.();
					return { env: getDefaultChatEnv(), text: userAuth.text };
				}
				autumnUserId = userAuth.userId;
			}

			const preparedPromise = prepareAttachmentMessage({
				attachments,
				fetchFallback: attachmentFetchFallback,
				logger,
				text,
			});
			const existingSessionPromise = (() => {
				if (engine.name === "claude-managed") {
					return findClaudeManagedSessionForThread({
						db,
						orgId: org.id,
						thread: effectiveThread,
						userId: autumnUserId,
					});
				}
				return Promise.resolve(undefined);
			})();

			const [prepared, existingHarnessSession] = await Promise.all([
				preparedPromise,
				existingSessionPromise,
			]);
			const params: MessageParams = {
				attachments: prepared.parts.map((part) => ({
					data: part.data,
					mimeType: part.mediaType,
					name: part.filename,
				})),
				recentMessages,
				text: prepared.userText,
			};

			const env =
				existingHarnessSession?.env ??
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
					source: existingHarnessSession ? "existing_session" : "selector",
				},
			});

			const token = await getInstallationOAuthAccessToken({
				installation: effectiveInstallation,
				env,
				orgId: org.id,
				userId: autumnUserId,
			});

			const agentTools =
				engine.name === "claude-managed"
					? { destructiveTools: new Set<string>() }
					: await setupAgentToolContext({ env, logger, token });

			const ctx: MessageContext = {
				agentTools,
				autumnUserId,
				claudeManagedSession:
					engine.name === "claude-managed"
						? (existingHarnessSession as ClaudeManagedSessionRef | undefined)
						: undefined,
				deadlineAt,
				env,
				id: agentRunId ?? crypto.randomUUID(),
				logger,
				onAction,
				onActionKeyed,
				onAgentReady,
				onApprovalsSuperseded,
				onThinking,
				org,
				onTurnComplete,
				providerUserId,
				run,
				thread: effectiveThread,
				timestamp: Date.now(),
				token,
			};

			const output = await engine.run({ ctx, params });
			return { ...output, installation: effectiveInstallation, org };
		})(),
		deadlineAt - Date.now() + TIMEOUT_BACKSTOP_GRACE_MS,
	);
};
