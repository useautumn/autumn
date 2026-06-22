import { createSlackAdapter } from "@chat-adapter/slack";
import { verifySlackSignature } from "@chat-adapter/slack/webhook";
import { createPostgresState } from "@chat-adapter/state-pg";
import type { Attachment, Message, Thread } from "chat";
import { Chat } from "chat";
import { runMessage } from "./agent/runMessage/runMessage.js";
import { editSupersededApprovalCards } from "./internal/approvals/actions/editSupersededApprovalCards.js";
import { handleApprovalAction } from "./internal/approvals/actions/handleApprovalAction.js";
import { handleViewPayloadAction } from "./internal/approvals/actions/handleViewPayloadAction.js";
import { postApprovalRequest } from "./internal/approvals/actions/postApprovalRequest.js";
import { handleStopAction } from "./internal/runs/handleStopAction.js";
import { dispatchThreadMessage } from "./internal/runs/runCoordinator.js";
import {
	type ActiveRun,
	closeRun,
	registerRun,
	runKeyForThread,
} from "./internal/runs/runRegistry.js";
import { shouldUseSlackAdminInstallationForWorkspace } from "./internal/slackAdmin/access.js";
import { decrypt } from "./lib/crypto.js";
import { env } from "./lib/env.js";
import {
	addLeafContext,
	createLeafSessionContext,
	logger as rootLogger,
} from "./lib/logger.js";
import { getSlackWorkspaceId } from "./providers/slack/context.js";
import {
	getSlackEventWorkspaceId,
	normalizeSlackEventsBody,
} from "./providers/slack/events.js";
import {
	fetchSlackAttachmentFallback,
	getSlackFilesFromRaw,
} from "./providers/slack/files.js";
import { findInstallationWithOrg } from "./providers/slack/installations.js";
import { getRecentMessages } from "./providers/slack/threadContext.js";
import type { ChatContextMessage } from "./types.js";
import {
	finishLoading,
	type LoadingState,
	type ReplyTarget,
	startLoading,
} from "./ui/progress.js";
import { createStatusTicker } from "./ui/statusTicker.js";

export const chatAdapterNames = ["slack"];

const getSlackAdminProvider = () =>
	`slack_admin:${env.SLACK_CLIENT_ID}` as const;

const findSlackInstallationForWorkspace = async ({
	workspaceId,
}: {
	workspaceId: string;
}) => {
	if (
		shouldUseSlackAdminInstallationForWorkspace({
			configuredWorkspaceId: env.SLACK_ADMIN_WORKSPACE_ID,
			isProduction: process.env.NODE_ENV === "production",
			workspaceId,
		})
	) {
		const adminInstallation = await findInstallationWithOrg(
			getSlackAdminProvider(),
			workspaceId,
		);
		if (adminInstallation) return adminInstallation;
	}

	return await findInstallationWithOrg("slack", workspaceId);
};

export const bot = new Chat({
	userName: env.CHAT_NAME,
	adapters: {
		slack: createSlackAdapter({
			clientId: env.SLACK_CLIENT_ID,
			clientSecret: env.SLACK_CLIENT_SECRET,
			installationProvider: {
				getInstallation: async (workspaceId) => {
					const installation = await findSlackInstallationForWorkspace({
						workspaceId,
					});
					if (!installation) return null;
					return {
						botToken: decrypt(installation.bot_access_token),
						botUserId: installation.bot_user_id ?? undefined,
						teamName: installation.workspace_name,
					};
				},
			},
			webhookVerifier: async (request, body) => {
				await verifySlackSignature(body, request.headers, {
					signingSecret: env.SLACK_SIGNING_SECRET,
				});
				const workspaceId = getSlackEventWorkspaceId(body);
				const installation = workspaceId
					? await findSlackInstallationForWorkspace({ workspaceId })
					: null;
				return normalizeSlackEventsBody({
					body,
					botUserId: installation?.bot_user_id,
				});
			},
			userName: env.CHAT_NAME,
		}),
	},
	state: createPostgresState({
		keyPrefix: "chat",
		url: env.CHAT_STATE_DATABASE_URL,
	}),
	// Handlers run immediately; the run coordinator serializes new runs per
	// thread and routes mid-run messages (stop keywords, live follow-ups).
	concurrency: "concurrent",
});

// One key per physical Slack thread, shared by message and dispatch paths.
const slackRunKey = ({
	channelId,
	raw,
	threadId,
}: {
	channelId: string;
	raw: unknown;
	threadId: string;
}) =>
	runKeyForThread({
		channelId,
		provider: "slack",
		threadId,
		workspaceId: getSlackWorkspaceId(raw),
	});

const runAndReply = async ({
	channelId,
	attachments,
	providerUserId,
	raw,
	recentMessages,
	runKey,
	target,
	text,
	threadId,
}: {
	attachments?: Attachment[];
	channelId: string;
	providerUserId: string;
	raw: unknown;
	recentMessages?: ChatContextMessage[];
	runKey: string;
	target: ReplyTarget;
	text: string;
	threadId: string;
}) => {
	const loading: LoadingState = null;
	let bootstrapLoading: LoadingState = null;
	let logger = rootLogger;
	let run: ActiveRun | undefined;
	const ticker = createStatusTicker(target);
	try {
		const workspaceId = getSlackWorkspaceId(raw);
		const installation = await findSlackInstallationForWorkspace({
			workspaceId,
		});
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

		const isFollowUp = recentMessages?.some((m) => m.isBot) ?? false;
		// First message in a thread shows a one-time "Starting Autumn" card that
		// stays pending until the managed agent reports ready; follow-ups skip it.
		bootstrapLoading = isFollowUp
			? null
			: await startLoading(target, { showPlan: true });
		// The live status ticker only starts cycling once the bootstrap card
		// resolves, so the two loading states never show at the same time.
		const completeBootstrap = async () => {
			if (!bootstrapLoading) return;
			const card = bootstrapLoading;
			bootstrapLoading = null;
			await finishLoading(target, card, "Autumn started.");
			ticker.thinking();
		};
		run = registerRun({ key: runKey, kind: "message" });
		// Follow-ups have no bootstrap card, so the status starts right away.
		if (isFollowUp) {
			ticker.thinking();
		}
		const logAction = (message: string) => ticker.activity(message);
		const logKeyed = ({ message }: { key: string; message: string }) =>
			ticker.activity(message);
		run.logAction = logAction;
		const rawFiles = getSlackFilesFromRaw({ raw });
		const botToken = decrypt(installation.bot_access_token);

		const output = await runMessage({
			agentRunId: session.agentRunId,
			attachmentFetchFallback: ({ attachment }) =>
				fetchSlackAttachmentFallback({
					attachment,
					botToken,
					rawFiles,
				}),
			attachments,
			installation,
			logger,
			onAction: logAction,
			onActionKeyed: logKeyed,
			onAgentReady: completeBootstrap,
			onApprovalsSuperseded: (approvals) =>
				editSupersededApprovalCards({ approvals, logger, target }),
			onThinking: ticker.thinking,
			onTurnComplete: async (turnText) => {
				await target.post({ markdown: turnText });
			},
			providerUserId,
			recentMessages,
			run,
			text,
			channelId,
			threadId,
		});

		if (output.finishReason === "stopped") {
			await finishLoading(target, loading, "Stopped.");
			const stoppedBy = run.stop?.byUserId;
			const notice =
				output.stopReason === "timeout"
					? "_I stopped because the run was taking too long. Send a new message to continue._"
					: `_Stopped${stoppedBy ? ` by <@${stoppedBy}>` : ""}. Nothing further was run._`;
			await target.post({
				markdown: [output.text, notice]
					.filter((part): part is string => Boolean(part?.trim()))
					.join("\n\n"),
			});
			logger.info("Posted stopped run notice", {
				event: "leaf.slack_run_stopped",
				data: { stop_reason: output.stopReason ?? "user" },
			});
			return;
		}

		const postedApproval = await postApprovalRequest({
			channelId,
			installation,
			loading,
			logAction,
			logger,
			orgId: output.org?.id ?? installation.org_id,
			output,
			providerUserId,
			target,
		});
		if (postedApproval) return;

		await finishLoading(target, loading, "Done.");
		await target.post({ markdown: output.text || "Done." });
		logger.info("Posted Slack response", {
			event: "leaf.slack_response_posted",
			data: {
				has_text: Boolean(output.text),
			},
		});
	} catch (error) {
		logger.error("[chat] Message failed", error, {
			event: "leaf.slack_message_failed",
		});
		await finishLoading(target, bootstrapLoading, "Couldn't start Autumn.");
		await finishLoading(target, loading, "Request failed.");
		await target.post({
			markdown: "I could not complete that request. Please try again.",
		});
	} finally {
		ticker.stop();
		if (run) closeRun({ key: run.key, run });
	}
};

const handleMessage = async (thread: Thread, message: Message) => {
	// Never respond to other bots (including a second Autumn app on the same
	// workspace) — otherwise two bots reply to each other in an infinite loop.
	if (message.author.isBot === true) {
		rootLogger.info("Skipping bot-authored Slack message", {
			event: "leaf.slack_message_skipped",
			data: { reason: "bot_author" },
		});
		return;
	}
	const runKey = slackRunKey({
		channelId: thread.channelId,
		raw: message.raw,
		threadId: thread.id,
	});
	await dispatchThreadMessage({
		hasAttachments: Boolean(message.attachments?.length),
		onFollowUpInjected: async () => {
			try {
				await thread.adapter.addReaction(thread.id, message.id, "eyes");
			} catch {
				// The reaction is a best-effort ack.
			}
		},
		providerUserId: message.author.userId,
		runKey,
		// Recent messages are fetched when the run actually starts, so a
		// mutex-queued message still sees the turns that finished before it.
		runNewMessage: async () =>
			runAndReply({
				target: thread,
				attachments: message.attachments,
				raw: message.raw,
				runKey,
				text: message.text,
				channelId: thread.channelId,
				providerUserId: message.author.userId,
				threadId: thread.id,
				recentMessages: await getRecentMessages(thread, message),
			}),
		text: message.text,
	});
};

bot.onDirectMessage(handleMessage);

bot.onNewMention(async (thread, message) => {
	await thread.subscribe();
	await handleMessage(thread, message);
});

bot.onSubscribedMessage(handleMessage);

bot.onSlashCommand(async (event) => {
	const runKey = slackRunKey({
		channelId: event.channel.id,
		raw: event.raw,
		threadId: event.channel.id,
	});
	await dispatchThreadMessage({
		hasAttachments: false,
		providerUserId: event.user.userId,
		runKey,
		runNewMessage: () =>
			runAndReply({
				target: event.channel,
				raw: event.raw,
				runKey,
				text: event.text || event.command,
				channelId: event.channel.id,
				providerUserId: event.user.userId,
				threadId: event.channel.id,
			}),
		text: event.text || event.command,
	});
});

bot.onAction(
	["approve_billing_action", "cancel_billing_action"],
	handleApprovalAction,
);

bot.onAction(["view_approval_payload"], handleViewPayloadAction);

bot.onAction(["stop_agent_run"], handleStopAction);

bot.registerSingleton();
