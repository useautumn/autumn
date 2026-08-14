import type { Attachment } from "chat";
import { withdrawAgentTurnApproval } from "../../../internal/agentRuntime/actions/withdrawAgentTurnApproval/withdrawAgentTurnApproval.js";
import type { AgentContextMessage } from "../../../internal/agentRuntime/domain/agentTurnContext.js";
import { editSupersededApprovalCards } from "../../../internal/approvals/surfaces/slack/superseded.js";
import {
	dispatchThreadMessage,
	hasQueuedThreadMessage,
} from "../../../internal/runs/runCoordinator.js";
import {
	type ActiveRun,
	closeRun,
	registerRun,
	runKeyForThread,
} from "../../../internal/runs/runRegistry.js";
import { decrypt } from "../../../lib/crypto.js";
import {
	addLeafContext,
	createLeafSessionContext,
	logger as rootLogger,
} from "../../../lib/logger.js";
import {
	GENERIC_FAILURE_MESSAGE,
	genericFailureWithDetail,
	POST_FORMATTING_FAILED_MESSAGE,
	RUN_STOPPED_FOR_TIME_MESSAGE,
	RUN_TIMED_OUT_MESSAGE,
	runStoppedByUserNotice,
} from "../../../ui/messages.js";
import type { ReplyTarget } from "../../../ui/progress.js";
import { createStatusTicker } from "../../../ui/statusTicker.js";
import { getSlackWorkspaceId } from "../context.js";
import { createEveSlackPresenter } from "../evePresenter.js";
import {
	fetchSlackAttachmentFallback,
	getSlackFilesFromRaw,
} from "../files.js";
import { findSlackInstallationForWorkspace } from "../installations.js";
import { presentSlackAgentTurn } from "../presenters/presentSlackAgentTurn.js";
import { runSlackAgentTurn } from "./runSlackAgentTurn.js";

const ERROR_NOTICE_MAX = 160;

const errorNotice = (error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	if (/invalid_blocks/i.test(message)) return POST_FORMATTING_FAILED_MESSAGE;
	if (/timed out|timeout/i.test(message)) return RUN_TIMED_OUT_MESSAGE;
	const detail = message.replace(/\s+/g, " ").trim().slice(0, ERROR_NOTICE_MAX);
	return detail ? genericFailureWithDetail(detail) : GENERIC_FAILURE_MESSAGE;
};

type DispatchSlackAgentMessageInput = {
	attachments?: ReadonlyArray<Attachment>;
	clientContext?: Readonly<Record<string, unknown>>;
	channelId: string;
	providerUserId: string;
	raw: unknown;
	react?: (input: { action: "add" | "remove"; emoji: string }) => Promise<void>;
	recentMessages?:
		| ReadonlyArray<AgentContextMessage>
		| (() => Promise<ReadonlyArray<AgentContextMessage>>);
	target: ReplyTarget;
	text: string;
	threadId: string;
};

const runAndReply = async ({
	attachments,
	channelId,
	clientContext,
	providerUserId,
	raw,
	react,
	recentMessages: recentMessagesInput,
	runKey,
	target,
	text,
	threadId,
}: DispatchSlackAgentMessageInput & { runKey: string }) => {
	let logger = rootLogger;
	let run: ActiveRun | undefined;
	const ticker = createStatusTicker(target);
	const evePresenter = createEveSlackPresenter({ ticker });
	const reactSafely = (input: { action: "add" | "remove"; emoji: string }) =>
		react?.(input).catch(() => undefined);
	ticker.thinking();
	try {
		const workspaceId = getSlackWorkspaceId(raw);
		const [installation, recentMessages] = await Promise.all([
			findSlackInstallationForWorkspace({ workspaceId }),
			Promise.resolve(
				typeof recentMessagesInput === "function"
					? recentMessagesInput()
					: recentMessagesInput,
			),
		]);
		if (!installation) {
			logger.warn("Slack installation not found", {
				event: "leaf.slack_installation_missing",
			});
			return;
		}

		const session = createLeafSessionContext({
			channelId,
			provider: installation.provider,
			providerUserId,
			threadId,
			workspaceId,
		});
		logger = addLeafContext(rootLogger, {
			...session.context,
			agent_run_id: session.agentRunId,
			org_id: installation.org_id,
			org_slug: installation.org_slug,
		});
		logger.info("Received Slack message", {
			event: "leaf.slack_message_received",
			data: {
				attachment_count: attachments?.length ?? 0,
				text_length: text.length,
			},
		});
		if (!text.trim() && !attachments?.length) {
			logger.info("Skipping empty Slack message", {
				event: "leaf.slack_message_skipped",
				data: { reason: "empty" },
			});
			return;
		}

		run = registerRun({
			key: runKey,
			kind: "message",
			ownerProviderUserId: providerUserId,
		});
		const logAction = (message: string) => {
			ticker.activity(message);
		};
		run.logAction = logAction;
		const rawFiles = getSlackFilesFromRaw({ raw });
		const botToken = decrypt(installation.bot_access_token);

		const output = await runSlackAgentTurn({
			agentRunId: session.agentRunId,
			attachmentFetchFallback: ({ attachment }) =>
				fetchSlackAttachmentFallback({ attachment, botToken, rawFiles }),
			attachments,
			channelId,
			clientContext,
			installation,
			logger,
			onAction: logAction,
			onApprovalsSuperseded: (approvals) =>
				editSupersededApprovalCards({ approvals, logger, target }),
			onReasoning: evePresenter.onReasoning,
			onThinking: ticker.thinking,
			providerUserId,
			recentMessages,
			run,
			text,
			threadId,
		});

		if (output.kind === "stopped") {
			ticker.stop();
			const notice =
				output.reason === "timeout"
					? RUN_STOPPED_FOR_TIME_MESSAGE
					: runStoppedByUserNotice(run.stop?.byUserId);
			await target.post({
				markdown: [output.text, notice]
					.filter((part): part is string => Boolean(part?.trim()))
					.join("\n\n"),
			});
			logger.info("Posted stopped run notice", {
				event: "leaf.slack_run_stopped",
				data: { stop_reason: output.reason },
			});
			return;
		}

		const outputInstallation =
			output.kind === "blocked" ? installation : output.installation;
		const orgId =
			output.kind === "blocked" ? outputInstallation.org_id : output.org.id;
		if (output.kind === "blocked") {
			ticker.stop();
			await target.post({ markdown: output.text });
			return;
		}

		if (hasQueuedThreadMessage(runKey)) {
			if (output.kind === "approval") {
				try {
					await withdrawAgentTurnApproval({
						approval: output.approval,
						auth: {
							appEnv: output.env,
							channelId,
							orgId,
							provider: outputInstallation.provider,
							providerUserId,
							threadId,
							workspaceId: outputInstallation.workspace_id,
						},
						orgId,
						sessionId: output.sessionId,
					});
				} catch (error) {
					logger.warn("Could not withdraw suspension for queued message", {
						event: "leaf.eve_queued_withdraw_failed",
						error,
					});
				}
			}
			logger.info("Suppressed reply; newer message queued", {
				event: "leaf.slack_reply_suppressed",
				data: { had_suspension: output.kind === "approval" },
			});
			return;
		}

		await presentSlackAgentTurn({
			channelId,
			clientContext,
			logAction,
			logger,
			providerUserId,
			stopStatus: ticker.stop,
			target,
			threadId,
			turn: output,
		});
	} catch (error) {
		logger.error("[chat] Message failed", error, {
			event: "leaf.slack_message_failed",
		});
		ticker.stop();
		await reactSafely({ action: "add", emoji: "x" });
		await target.post({
			markdown: `:warning: ${errorNotice(error)}`,
		});
	} finally {
		ticker.stop();
		await reactSafely({ action: "remove", emoji: "eyes" });
		if (run) closeRun({ key: run.key, run });
	}
};

export const dispatchSlackAgentMessage = async (
	input: DispatchSlackAgentMessageInput,
) => {
	const runKey = runKeyForThread({
		channelId: input.channelId,
		provider: "slack",
		threadId: input.threadId,
		workspaceId: getSlackWorkspaceId(input.raw),
	});
	await dispatchThreadMessage({
		hasAttachments: Boolean(input.attachments?.length),
		providerUserId: input.providerUserId,
		runKey,
		runNewMessage: () => runAndReply({ ...input, runKey }),
		text: input.text,
	});
};
