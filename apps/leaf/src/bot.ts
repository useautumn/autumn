import { verifyDashboardSession } from "@autumn/auth";
import { buildCatalogDecisionModel } from "@autumn/render";
import type { AppEnv, CatalogPlanPreview } from "@autumn/shared";
import { createSlackAdapter } from "@chat-adapter/slack";
import { verifySlackSignature } from "@chat-adapter/slack/webhook";
import { createPostgresState } from "@chat-adapter/state-pg";
import { createWebAdapter } from "@chat-adapter/web";
import type { Attachment, Message, Thread } from "chat";
import { Chat } from "chat";
import { runMessage } from "./agent/runMessage/runMessage.js";
import {
	answerEveQuestion,
	withdrawEveSuspension,
} from "./harness/eve/approval.js";
import { redirectCatalogSuspensionToDecision } from "./harness/eve/catalogDecision.js";
import { chatApprovalRepo } from "./internal/approvals/repos/chatApprovalRepo.js";
import { handleApprovalAction } from "./internal/approvals/surfaces/slack/decide.js";
import {
	postApprovalCardForRow,
	presentApproval,
} from "./internal/approvals/surfaces/slack/present.js";
import { editSupersededApprovalCards } from "./internal/approvals/surfaces/slack/superseded.js";
import { handleViewPayloadAction } from "./internal/approvals/surfaces/slack/viewPayload.js";
import { ensureWebChatAuth } from "./internal/installations/actions/ensureWebChatAuth.js";
import { getInstallationOAuthAccessToken } from "./internal/installations/actions/getInstallationOAuthAccessToken.js";
import { handleStopAction } from "./internal/runs/handleStopAction.js";
import {
	dispatchThreadMessage,
	hasQueuedThreadMessage,
} from "./internal/runs/runCoordinator.js";
import {
	type ActiveRun,
	closeRun,
	registerRun,
	runKeyForThread,
} from "./internal/runs/runRegistry.js";
import { shouldUseSlackAdminInstallationForWorkspace } from "./internal/slackAdmin/access.js";
import { decrypt } from "./lib/crypto.js";
import { db } from "./lib/db.js";
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
import { createEveSlackPresenter } from "./providers/slack/evePresenter.js";
import {
	fetchSlackAttachmentFallback,
	getSlackFilesFromRaw,
} from "./providers/slack/files.js";
import { findInstallationWithOrg } from "./providers/slack/installations.js";
import { getRecentMessages } from "./providers/slack/threadContext.js";
import { runWebMessage } from "./providers/web/runWebMessage.js";
import {
	generateThreadTitle,
	persistThreadTitle,
} from "./providers/web/threadTitle.js";
import type { ChatContextMessage } from "./types.js";
import {
	ANSWER_QUESTION_ACTION,
	CATALOG_DECISION_ACTION,
	type CatalogDecisionButtonPayload,
	catalogDecisionCard,
	catalogDecisionSubmittedCard,
	indexedActionIds,
	type QuestionButtonPayload,
	questionAnsweredCard,
	questionCard,
} from "./ui/eveCards.js";
import {
	finishLoading,
	type LoadingState,
	type ReplyTarget,
	startLoading,
} from "./ui/progress.js";
import { createStatusTicker } from "./ui/statusTicker.js";

export const chatAdapterNames = ["slack", "web"];

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
		web: createWebAdapter({
			userName: env.CHAT_NAME,
			getUser: async (request) => {
				const session = await verifyDashboardSession({
					cookie: request.headers.get("cookie"),
					authBaseUrl: env.BETTER_AUTH_URL,
				});
				rootLogger.info("Web chat getUser", {
					event: "leaf.web_chat_get_user",
					data: {
						hasCookie: Boolean(request.headers.get("cookie")),
						authenticated: Boolean(session?.userId),
						hasOrg: Boolean(session?.activeOrganizationId),
					},
				});
				if (!session?.activeOrganizationId) {
					return null;
				}
				// Mint/refresh this user's scope-bound MCP OAuth credential at the
				// cookie boundary, so downstream reads never run unauthenticated.
				await ensureWebChatAuth({
					orgId: session.activeOrganizationId,
					userId: session.userId,
					userScopes: session.scopes,
				});
				// Encode the server-resolved org into the user id (WebUser carries no
				// org field); runWebMessage decodes it. `~` avoids the `:` used in
				// chat-sdk thread ids.
				return { id: `${session.userId}~${session.activeOrganizationId}` };
			},
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

const ERROR_NOTICE_MAX = 160;

/** One clean, human line about what failed — never a stack or a shrug. */
const errorNotice = (error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	if (/invalid_blocks/i.test(message)) {
		return "I hit a formatting error posting that reply — the run itself may have succeeded. Ask me to summarize where things stand.";
	}
	if (/timed out|timeout/i.test(message)) {
		return "That run took too long and was stopped. Send your message again to continue.";
	}
	const detail = message.replace(/\s+/g, " ").trim().slice(0, ERROR_NOTICE_MAX);
	return detail
		? `Something went wrong: ${detail} — please try again.`
		: "Something went wrong — please try again.";
};

type RunAndReplyInput = {
	attachments?: Attachment[];
	/** One-turn structured context (e.g. a submitted catalog decision card). */
	clientContext?: Record<string, unknown>;
	channelId: string;
	providerUserId: string;
	raw: unknown;
	/** Reacts to the triggering message (👀 while working, ❌ on failure). */
	react?: (input: { action: "add" | "remove"; emoji: string }) => Promise<void>;
	recentMessages?: ChatContextMessage[];
	runKey: string;
	target: ReplyTarget;
	text: string;
	threadId: string;
};

const runAndReply = async ({
	channelId,
	attachments,
	clientContext,
	providerUserId,
	raw,
	react,
	recentMessages: recentMessagesInput,
	runKey,
	target,
	text,
	threadId,
}: Omit<RunAndReplyInput, "recentMessages"> & {
	/** A thunk defers the Slack history fetch to run start (queued messages
	 * must see turns that finished before them) while still overlapping it
	 * with the installation lookup. */
	recentMessages?: ChatContextMessage[] | (() => Promise<ChatContextMessage[]>);
}) => {
	const loading: LoadingState = null;
	let bootstrapLoading: LoadingState = null;
	let logger = rootLogger;
	let run: ActiveRun | undefined;
	const ticker = createStatusTicker(target);
	const evePresenter =
		env.SLACK_AGENT_HARNESS === "eve"
			? createEveSlackPresenter({ ticker })
			: null;
	// Reactions are best-effort acknowledgment; never fail the run on them.
	const reactSafely = (input: { action: "add" | "remove"; emoji: string }) =>
		react?.(input).catch(() => undefined);
	// Status starts before any lookups so the thread never sits silent.
	if (evePresenter) ticker.thinking();
	try {
		const workspaceId = getSlackWorkspaceId(raw);
		// The Slack history fetch (recentMessages) overlaps the DB lookup.
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

		const isFollowUp = recentMessages?.some((m) => m.isBot) ?? false;
		// First message in a thread shows a one-time "Starting Autumn" card that
		// stays pending until the managed agent reports ready; follow-ups skip it.
		// Eve acknowledges via reaction + status line instead — no cards.
		bootstrapLoading =
			isFollowUp || evePresenter
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
		run = registerRun({
			key: runKey,
			kind: "message",
			...(env.SLACK_AGENT_HARNESS === "eve"
				? {
						sendInterrupt: async () => undefined,
						sendUserMessage: async () => {
							throw new Error(
								"Eve follow-up injection is queued after the active run",
							);
						},
					}
				: {}),
		});
		// Follow-ups have no bootstrap card, so the status starts right away.
		if (isFollowUp || evePresenter) {
			ticker.thinking();
		}
		// Label the thread off its opening message, in parallel with the run;
		// persisted fire-and-forget below so the reply is never delayed.
		const titlePromise =
			!(isFollowUp || clientContext) && text.trim()
				? generateThreadTitle({ logger, text })
				: undefined;
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
			clientContext,
			installation,
			logger,
			onAction: logAction,
			onActionKeyed: logKeyed,
			onAgentReady: completeBootstrap,
			onApprovalsSuperseded: (approvals) =>
				editSupersededApprovalCards({ approvals, logger, target }),
			onReasoning: evePresenter?.onReasoning,
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

		const outputInstallation = output.installation ?? installation;
		const orgId = output.org?.id ?? outputInstallation.org_id;

		if (titlePromise) {
			void persistThreadTitle({
				db,
				env: output.env,
				logger,
				orgId,
				thread: {
					channelId,
					provider: outputInstallation.provider,
					threadId,
					workspaceId: outputInstallation.workspace_id,
				},
				titlePromise,
			});
		}

		// A newer message is already queued behind this run — fold this reply
		// into the next turn instead of posting two bot responses back-to-back.
		// A parked write is withdrawn silently (its card was never shown).
		if (evePresenter && hasQueuedThreadMessage(runKey)) {
			if (output.suspension && output.runId) {
				try {
					await withdrawEveSuspension({
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
						runId: output.runId,
						suspension: output.suspension,
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
				data: { had_suspension: Boolean(output.suspension) },
			});
			return;
		}

		// updateCatalog is the chokepoint the model can't skip: when the parked
		// write still needs versioning/variant/migration choices, deny it and
		// render the decision card instead of an approval card.
		let decisionPlan: CatalogPlanPreview | undefined;
		if (evePresenter && output.suspension) {
			try {
				logAction("Reviewing versioning impact");
				const token = await getInstallationOAuthAccessToken({
					installation: outputInstallation,
					env: output.env,
					orgId,
				});
				decisionPlan = await redirectCatalogSuspensionToDecision({
					decisionProvided: Boolean(clientContext?.catalogDecision),
					env: output.env,
					logger,
					orgId,
					providerUserId,
					runId: output.runId,
					suspension: output.suspension,
					thread: {
						channelId,
						provider: outputInstallation.provider,
						threadId,
						workspaceId: outputInstallation.workspace_id,
					},
					token,
				});
			} catch (error) {
				logger.warn("Could not evaluate catalog decision redirect", {
					event: "leaf.eve_catalog_redirect_failed",
					error,
				});
			}
		}
		// The model stopped after a decision-needing preview without a write call.
		if (
			!decisionPlan &&
			output.catalogDecision &&
			!clientContext?.catalogDecision
		) {
			decisionPlan = output.catalogDecision.plan as CatalogPlanPreview;
		}

		if (decisionPlan) {
			await finishLoading(target, loading, "Decision needed.");
			if (output.text?.trim()) {
				await target.post({ markdown: output.text });
			}
			await target.post(
				catalogDecisionCard({
					env: output.env,
					model: buildCatalogDecisionModel({ plan: decisionPlan }),
					orgId,
					plan: decisionPlan,
				}),
			);
			return;
		}

		if (evePresenter && output.question && output.runId) {
			await finishLoading(target, loading, "Question for you.");
			await target.post(
				questionCard({
					env: output.env,
					options: output.question.options,
					orgId,
					prompt: output.question.prompt,
					requestId: output.question.requestId,
					sessionId: output.runId,
				}),
			);
			return;
		}

		const postedApproval = await presentApproval({
			channelId,
			installation: outputInstallation,
			loading,
			logAction,
			logger,
			orgId,
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
		// Stop the status loop before posting, or a pending tick re-renders
		// "Thinking…" over the cleared status after the error message lands.
		ticker.stop();
		await reactSafely({ action: "add", emoji: "x" });
		await finishLoading(target, bootstrapLoading, "Couldn't start Autumn.");
		await finishLoading(target, loading, "Request failed.");
		await target.post({
			markdown: `:warning: ${errorNotice(error)}`,
		});
	} finally {
		ticker.stop();
		await reactSafely({ action: "remove", emoji: "eyes" });
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
	// Web (dashboard) messages run Leaf's core without a Slack installation.
	// Web thread ids follow the `web:{userId}:{conversationId}` pattern.
	if (thread.id.startsWith("web:")) {
		await runWebMessage({ message, thread });
		return;
	}
	const runKey = slackRunKey({
		channelId: thread.channelId,
		raw: message.raw,
		threadId: thread.id,
	});
	// Acknowledge instantly, before any lookups — the 👀 lands while the run
	// (or the queue ahead of it) is still spinning up.
	thread.adapter.addReaction(thread.id, message.id, "eyes").catch(() => {});
	await dispatchThreadMessage({
		hasAttachments: Boolean(message.attachments?.length),
		providerUserId: message.author.userId,
		runKey,
		// Recent messages are fetched when the run actually starts, so a
		// mutex-queued message still sees the turns that finished before it.
		runNewMessage: async () =>
			runAndReply({
				target: thread,
				attachments: message.attachments,
				raw: message.raw,
				react: async ({ action, emoji }) => {
					if (action === "add") {
						await thread.adapter.addReaction(thread.id, message.id, emoji);
					} else {
						await thread.adapter.removeReaction(thread.id, message.id, emoji);
					}
				},
				runKey,
				text: message.text,
				channelId: thread.channelId,
				providerUserId: message.author.userId,
				threadId: thread.id,
				// A thunk on purpose: fetched at run start (after any queue wait),
				// in parallel with the installation lookup.
				recentMessages: () => getRecentMessages(thread, message),
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

const parseButtonPayload = <T>(value?: string): T | null => {
	if (!value) return null;
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
};

// A clicked answer chip on a parked ask_question: answer eve structurally,
// then relay whatever the resumed turn produced (text, another question, or a
// chained gated write).
bot.onAction(indexedActionIds(ANSWER_QUESTION_ACTION), async (event) => {
	const payload = parseButtonPayload<QuestionButtonPayload>(event.value);
	if (!payload) return;
	const workspaceId = getSlackWorkspaceId(event.raw);
	const installation = await findSlackInstallationForWorkspace({ workspaceId });
	if (!installation) return;
	const providerUserId = event.user.userId;

	// Collapse the buttons immediately so double-clicks read as answered.
	try {
		await event.adapter.editMessage?.(
			event.threadId,
			event.messageId,
			questionAnsweredCard({
				actorId: providerUserId,
				answerLabel: payload.l,
				prompt: payload.q,
			}),
		);
	} catch {
		// Cosmetic; the structural answer below is what matters.
	}
	try {
		await event.thread?.startTyping("Working on it...");
	} catch {
		// Cosmetic.
	}

	try {
		const result = await answerEveQuestion({
			auth: {
				appEnv: payload.e as AppEnv,
				channelId: event.thread?.channelId ?? event.threadId,
				orgId: payload.g,
				provider: installation.provider,
				providerUserId,
				threadId: event.threadId,
				workspaceId: installation.workspace_id,
			},
			optionId: payload.o,
			orgId: payload.g,
			requestId: payload.r,
			sessionId: payload.s,
		});
		if ("error" in result) {
			await event.thread?.post({
				markdown: `I couldn't record that answer (${result.message}). Reply in the thread instead.`,
			});
			return;
		}
		if (result.text.trim()) {
			await event.thread?.post({ markdown: result.text });
		}
		if (result.question) {
			await event.thread?.post(
				questionCard({
					env: payload.e as AppEnv,
					options: result.question.options,
					orgId: payload.g,
					prompt: result.question.prompt,
					requestId: result.question.requestId,
					sessionId: result.sessionId,
				}),
			);
		}
		if (result.chainedApprovalId && event.thread) {
			const chained = await chatApprovalRepo.get({
				approvalId: result.chainedApprovalId,
				db,
			});
			if (chained) {
				await postApprovalCardForRow({
					approval: chained,
					target: event.thread,
				});
			}
		}
	} catch (error) {
		rootLogger.error("[chat] Question answer failed", error, {
			event: "leaf.eve_question_answer_failed",
		});
		await event.thread?.post({
			markdown:
				"I couldn't record that answer — it may already be resolved. Reply in the thread instead.",
		});
	}
});

// A clicked catalog decision: dispatch a new run carrying the decision as
// one-turn clientContext, exactly like the dashboard's decision card.
bot.onAction(indexedActionIds(CATALOG_DECISION_ACTION), async (event) => {
	const payload = parseButtonPayload<CatalogDecisionButtonPayload>(event.value);
	if (!(payload && event.thread)) return;
	const thread = event.thread;
	const providerUserId = event.user.userId;
	try {
		await event.adapter.editMessage?.(
			event.threadId,
			event.messageId,
			catalogDecisionSubmittedCard({
				actorId: providerUserId,
				choiceLabel: payload.l,
				planName: payload.p,
			}),
		);
	} catch {
		// Cosmetic; the dispatched run is what matters.
	}

	const decision = {
		migrationDraft: payload.m === 1,
		planId: payload.p,
		propagateVariantIds: payload.pv,
		versioning: payload.v,
	};
	const text = `I chose "${payload.l}" for ${payload.p} on the catalog decision card. Apply the change with these decisions.`;
	const runKey = slackRunKey({
		channelId: thread.channelId,
		raw: event.raw,
		threadId: event.threadId,
	});
	await dispatchThreadMessage({
		hasAttachments: false,
		providerUserId,
		runKey,
		runNewMessage: () =>
			runAndReply({
				// ActionEvent threads carry an unknown state generic; posting works
				// identically to message-handler threads.
				target: thread as unknown as ReplyTarget,
				clientContext: { catalogDecision: decision },
				raw: event.raw,
				runKey,
				text,
				channelId: thread.channelId,
				providerUserId,
				threadId: event.threadId,
			}),
		text,
	});
});

bot.onAction(["view_approval_payload"], handleViewPayloadAction);

bot.onAction(["stop_agent_run"], handleStopAction);

bot.registerSingleton();
