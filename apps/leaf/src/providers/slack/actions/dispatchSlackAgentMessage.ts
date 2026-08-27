import type { Attachment } from "chat";
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
import { controlMessageFrom } from "../routing/controlMessage.js";
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
	// Invisible to Braintrust and to the turn's own prepare_ms.
	const ingressStartedAt = Date.now();
	let historyMs = 0;
	try {
		const workspaceId = getSlackWorkspaceId(raw);
		const historyStartedAt = Date.now();
		const [installation, recentMessages] = await Promise.all([
			findSlackInstallationForWorkspace({ workspaceId }),
			Promise.resolve(
				typeof recentMessagesInput === "function"
					? recentMessagesInput()
					: recentMessagesInput,
			),
		]);
		historyMs = Date.now() - historyStartedAt;
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
		const startPostStartedAt = Date.now();
		await progress.start();
		const startPostMs = Date.now() - startPostStartedAt;
		logger.info("Slack ingress complete", {
			event: "leaf.slack_ingress_completed",
			data: {
				history_ms: historyMs,
				ingress_ms: Date.now() - ingressStartedAt,
				start_post_ms: startPostMs,
			},
		});
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

		if (output.kind === "blocked") {
			await progress.fail(output.text);
			await target.post({ markdown: output.text });
			return "close";
		}

		if (hasQueuedThreadMessage(runKey)) {
			// A pending approval left here is withdrawn by the queued message's own
			// turn: its denies ride that message's eve post, with no drain turn.
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
	// Control commands must never start a run, however the bot was addressed:
	// "stop" halts the active run; "stop replying" also mutes the thread.
	const control = controlMessageFrom(input.text);
	if (control) {
		await stopActiveThreadRun({
			byUserId: input.providerUserId,
			runKey,
		});
		try {
			await input.react?.({ action: "remove", emoji: "eyes" });
			await input.react?.({ action: "add", emoji: "white_check_mark" });
		} catch {
			// Reactions are best-effort; the control must still take effect.
		}
		return control === "opt_out" ? "close" : "keep";
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
