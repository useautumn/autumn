import type { ClaudeManagedSessionRef } from "../../harness/claudeManaged/session/ensureSession.js";
import { findClaudeManagedSessionForThread } from "../../harness/claudeManaged/session/ensureSession.js";
import type { VercelHarnessSessionRef } from "../../harness/vercelHarness/session/ensureSession.js";
import { findVercelHarnessSessionForThread } from "../../harness/vercelHarness/session/ensureSession.js";
import { getInstallationOAuthAccessToken } from "../../internal/installations/actions/getInstallationOAuthAccessToken.js";
import { messageTimeoutMs } from "../../lib/chatAgentConfig.js";
import { db } from "../../lib/db.js";
import { env as chatEnv } from "../../lib/env.js";
import { logger as rootLogger } from "../../lib/logger.js";
import type { BotMessage } from "../../types.js";
import { agentEngines } from "./engines/engines.js";
import { prepareAttachmentMessage } from "./setup/prepareAttachments.js";
import { selectChatEnv } from "./setup/selectChatEnv.js";
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
}: BotMessage) => {
	// The engine interrupts the session at the deadline; the wider outer
	// timeout only fires if the stream itself wedges.
	const deadlineAt = Date.now() + messageTimeoutMs[chatEnv.AGENT_HARNESS];
	return withTimeout(
		(async () => {
			const engine = agentEngines[chatEnv.AGENT_HARNESS];
			const thread = {
				channelId,
				provider: installation.provider,
				threadId,
				workspaceId: installation.workspace_id,
			};

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
						orgId: installation.org_id,
						thread,
					});
				}
				if (engine.name === "vercel") {
					return findVercelHarnessSessionForThread({
						db,
						orgId: installation.org_id,
						thread,
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
					org_id: installation.org_id,
					provider: installation.provider,
				},
				data: {
					source: existingHarnessSession ? "existing_session" : "selector",
				},
			});

			const token = await getInstallationOAuthAccessToken({
				installation,
				env,
			});

			const agentTools =
				engine.name === "claude-managed"
					? { destructiveTools: new Set<string>(), docsText: "" }
					: await setupAgentToolContext({ env, logger, token });

			const ctx: MessageContext = {
				agentTools,
				claudeManagedSession:
					engine.name === "claude-managed"
						? (existingHarnessSession as ClaudeManagedSessionRef | undefined)
						: undefined,
				vercelHarnessSession:
					engine.name === "vercel"
						? (existingHarnessSession as VercelHarnessSessionRef | undefined)
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
				org: {
					id: installation.org_id,
					slug: installation.org_slug ?? undefined,
				},
				onTurnComplete,
				providerUserId,
				run,
				thread,
				timestamp: Date.now(),
				token,
			};

			return engine.run({ ctx, params });
		})(),
		deadlineAt - Date.now() + TIMEOUT_BACKSTOP_GRACE_MS,
	);
};
