import type { Attachment } from "chat";
import { withdrawAgentTurnApproval } from "../../../internal/agentRuntime/actions/withdrawAgentTurnApproval/withdrawAgentTurnApproval.js";
import type { AgentContextMessage } from "../../../internal/agentRuntime/domain/agentTurnContext.js";
import { isTransientNetworkError } from "../../../internal/agentRuntime/eve/streamErrors.js";
import { editSupersededApprovalCards } from "../../../internal/approvals/surfaces/slack/superseded.js";
import {
	dispatchThreadMessage,
	hasQueuedThreadMessage,
	stopActiveThreadRun,
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
	errorNotice,
	RUN_STOPPED_FOR_TIME_MESSAGE,
	runStoppedByUserNotice,
} from "../../../ui/messages.js";
import type { ReplyTarget } from "../../../ui/progress.js";
import { createRunProgress } from "../../../ui/runProgress.js";
import { getSlackWorkspaceId } from "../context.js";
import { slackMessageMentionsUser } from "../events.js";
import { createEveSlackPresenter } from "../evePresenter.js";
import {
	fetchSlackAttachmentFallback,
	getSlackFilesFromRaw,
} from "../files.js";
import { findSlackInstallationForWorkspace } from "../installations.js";
import { presentSlackAgentTurn } from "../presenters/presentSlackAgentTurn.js";
import { isExplicitOptOut } from "../routing/explicitOptOut.js";
import { runSlackAgentTurn } from "./runSlackAgentTurn.js";

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
	showRunPlan?: boolean;
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
	showRunPlan = false,
	target,
	text,
	threadId,
}: DispatchSlackAgentMessageInput & {
	runKey: string;
}): Promise<"close" | "keep"> => {
	let logger = rootLogger;
	let run: ActiveRun | undefined;
	const progress = createRunProgress({ showPlan: showRunPlan, target, text });
	const evePresenter = createEveSlackPresenter({ setStatus: progress.status });
	const reactSafely = (input: { action: "add" | "remove"; emoji: string }) =>
		react?.(input).catch(() => undefined);
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
			return "close";
		}
		if (
			showRunPlan &&
			!slackMessageMentionsUser({
				raw,
				userId: installation.bot_user_id,
			})
		) {
			logger.info("Skipping Slack message addressed to another app", {
				event: "leaf.slack_message_skipped",
				data: { reason: "different_bot_mention" },
			});
			return "close";
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
			return "close";
		}

		progress.thinking();
		run = registerRun({
			key: runKey,
			kind: "message",
			ownerProviderUserId: providerUserId,
		});
		await progress.start();
		const logAction = progress.activity;
		run.logAction = logAction;
		run.onStop = progress.stop;
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
			onThinking: progress.thinking,
			providerUserId,
			recentMessages,
			run,
			text,
			threadId,
		});

		if (output.kind === "stopped") {
			await progress.fail(
				output.reason === "timeout" ? "Timed out" : "Stopped by user",
			);
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
			return "close";
		}

		const outputInstallation =
			output.kind === "blocked" ? installation : output.installation;
		const orgId =
			output.kind === "blocked" ? outputInstallation.org_id : output.org.id;
		if (output.kind === "blocked") {
			await progress.fail(output.text);
			await target.post({ markdown: output.text });
			return "close";
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
			await progress.complete();
			return "keep";
		}

		await presentSlackAgentTurn({
			channelId,
			clientContext,
			logAction,
			logger,
			providerUserId,
			stopStatus: progress.stop,
			target,
			threadId,
			turn: output,
		});
		await progress.complete();
		return "keep";
	} catch (error) {
		logger.error("[chat] Message failed", error, {
			event: "leaf.slack_message_failed",
		});
		await progress.fail(
			errorNotice({ error, isTransient: isTransientNetworkError }),
		);
		await reactSafely({ action: "add", emoji: "x" });
		await target.post({
			markdown: `:warning: ${errorNotice({ error, isTransient: isTransientNetworkError })}`,
		});
		return "close";
	} finally {
		progress.stop();
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
	// "stop replying" and friends must never start a run — mentions and DMs
	// skip the subscribed-message classifier, so the opt-out is checked here.
	if (isExplicitOptOut(input.text)) {
		await stopActiveThreadRun({
			byUserId: input.providerUserId,
			runKey,
		});
		try {
			await input.react?.({ action: "remove", emoji: "eyes" });
			await input.react?.({ action: "add", emoji: "white_check_mark" });
		} catch {
			// Reactions are best-effort; the opt-out must still close the thread.
		}
		return "close";
	}
	return (
		(await dispatchThreadMessage({
			hasAttachments: Boolean(input.attachments?.length),
			providerUserId: input.providerUserId,
			runKey,
			runNewMessage: () => runAndReply({ ...input, runKey }),
			text: input.text,
		})) ?? "keep"
	);
};
