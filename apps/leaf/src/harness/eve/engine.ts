import type { ChatApproval } from "@autumn/shared";
import type { AgentEngine } from "../../agent/runMessage/types.js";
import {
	isSilentTool,
	normalizeToolName,
} from "../../agent/tools/toolPolicy.js";
import { chatApprovalRepo } from "../../internal/approvals/repos/chatApprovalRepo.js";
import { executeAutumnMcpTool } from "../../internal/autumnMcp/client.js";
import { autumnOrgContextService } from "../../internal/autumnMcp/orgContextService.js";
import { db } from "../../lib/db.js";
import { env as leafEnv } from "../../lib/env.js";
import { parsePreviewPayload } from "../../ui/previewContent.js";
import { buildHarnessMessageText } from "../common/messageText.js";
import { buildThreadKey } from "../common/threadKey.js";
import { denyOptionFromApproval, drainParkedEveTurn } from "./approval.js";
import {
	catalogPlanNeedingDecision,
	enrichCatalogPreview,
} from "./catalogDecision.js";
import {
	type EveMessageContent,
	EveStreamIdleTimeoutError,
	postEveInputResponse,
	postEveMessage,
	resyncEveStreamIndex,
	streamEveEvents,
} from "./client.js";
import {
	approvalOptionIds,
	displayEveToolLabel,
	type EveAction,
	type EveActionResult,
	type EveInputRequest,
	isPreviewToolName,
	labelForResult,
	textForInputRequests,
} from "./events.js";
import { getEveSession, upsertEveSession } from "./repo.js";
import type {
	EveAuthContext,
	EveSessionRef,
	EveSessionState,
} from "./types.js";

const initialState = (continuationToken: string): EveSessionState => ({
	version: 1,
	continuationToken,
	streamIndex: 0,
	status: "running",
	lastEventAt: Date.now(),
});

const updateState = async ({
	orgId,
	session,
	state,
}: {
	orgId: string;
	session: EveSessionRef;
	state: Partial<EveSessionState>;
}) => {
	const next = { ...session.state, ...state, lastEventAt: Date.now() };
	session.state = next;
	await upsertEveSession({
		db,
		env: session.env,
		orgId,
		sessionId: session.sessionId,
		state: next,
		threadKey: session.threadKey,
	});
};

export const eveEngine: AgentEngine = {
	name: "eve",
	run: async ({ ctx, params }) => {
		const {
			env,
			logger,
			onAction,
			onAgentReady,
			onApprovalsSuperseded,
			onReasoning,
			onThinking,
			org,
			providerUserId,
			run,
			thread,
			token,
		} = ctx;

		const auth: EveAuthContext = {
			appEnv: env,
			autumnUserId: ctx.autumnUserId,
			channelId: thread.channelId,
			orgId: org.id,
			provider: thread.provider,
			providerUserId,
			threadId: thread.threadId,
			workspaceId: thread.workspaceId,
		};

		let session =
			ctx.eveSession ??
			(await getEveSession({ db, env, orgId: org.id, thread }));
		const newSession = !session;
		let orgContext: Awaited<ReturnType<typeof autumnOrgContextService.load>>;

		if (newSession) {
			await onAction?.("Loading context");
			orgContext = await autumnOrgContextService.load({ env, logger, token });
		} else if (session) {
			const pendingApprovals = await chatApprovalRepo.listPendingForRun({
				db,
				channelId: thread.channelId,
				env,
				orgId: org.id,
				provider: thread.provider,
				runId: session.sessionId,
				workspaceId: thread.workspaceId,
			});
			if (pendingApprovals.length > 0) {
				const cancelledApprovals: ChatApproval[] = [];
				for (const approval of pendingApprovals) {
					if (approval.tool_call_id) {
						try {
							const posted = await postEveInputResponse({
								auth,
								note: "(The user replied with a new message instead of deciding on this pending request, so it was withdrawn. Do not rebuild or ask anything — reply with nothing; their new message follows immediately and you should act on that, treating it as a refinement of the withdrawn change where it reads like one.)",
								optionId: denyOptionFromApproval(approval),
								requestId: approval.tool_call_id,
								session,
							});
							session.sessionId = posted.sessionId;
							session.state = {
								...session.state,
								continuationToken: posted.continuationToken,
								status: "running",
								lastEventAt: Date.now(),
							};
							// Discard the withdrawal turn's reply — without this, its
							// text would end THIS run and the user's actual message
							// would be processed with nobody streaming.
							await drainParkedEveTurn({ auth, orgId: org.id, session });
						} catch (error) {
							logger.warn("Could not deny superseded Eve approval", {
								event: "leaf.eve_superseded_approval_deny_failed",
								approval_id: approval.id,
								data: {
									error: error instanceof Error ? error.message : String(error),
								},
							});
						}
					}
					const cancelled = await chatApprovalRepo.cancel({
						approvalId: approval.id,
						db,
						providerUserId,
					});
					cancelledApprovals.push(cancelled ?? approval);
				}
				await onApprovalsSuperseded?.(cancelledApprovals);
			}
		}

		let messageText = buildHarnessMessageText({
			env,
			newSession,
			orgContext,
			params,
		});
		// Binary attachments ride as file parts (base64 data: URLs) beside the
		// text; eve stages them for the model call. Behind a flag until eve's
		// queue boundary stops corrupting file bytes — meanwhile the model gets
		// an honest note instead of a hard turn failure.
		const sendFileParts =
			Boolean(params.attachments?.length) && leafEnv.EVE_ATTACHMENTS_ENABLED;
		if (params.attachments?.length && !sendFileParts) {
			const names = params.attachments
				.map((attachment) => attachment.name ?? attachment.mimeType)
				.join(", ");
			messageText = `${messageText}\n\n(The user attached file(s) — ${names} — but file ingestion isn't available on this channel yet. Acknowledge this and ask them to paste the relevant content as text.)`;
		}
		const message: EveMessageContent = sendFileParts
			? [
					{ text: messageText, type: "text" as const },
					...(params.attachments ?? []).map((attachment) => ({
						data: `data:${attachment.mimeType};base64,${attachment.data.toString("base64")}`,
						filename: attachment.name,
						mediaType: attachment.mimeType,
						type: "file" as const,
					})),
				]
			: messageText;
		// A chip answer resolves the parked request structurally; sending the
		// wrapped message too would replay it as a second user turn.
		const answeringQuestion = Boolean(params.questionResponse && session);
		const posted = await postEveMessage({
			auth,
			clientContext: params.clientContext,
			inputResponses: answeringQuestion
				? [params.questionResponse as { optionId: string; requestId: string }]
				: undefined,
			message: answeringQuestion ? undefined : message,
			session,
		});
		if (!session) {
			session = {
				env,
				newSession: true,
				sessionId: posted.sessionId,
				state: initialState(posted.continuationToken),
				threadKey: buildThreadKey({ env, thread }),
			};
		} else {
			session.sessionId = posted.sessionId;
			session.state = {
				...session.state,
				continuationToken: posted.continuationToken,
				status: "running",
				lastEventAt: Date.now(),
			};
		}
		await upsertEveSession({
			db,
			env,
			orgId: org.id,
			sessionId: session.sessionId,
			state: session.state,
			threadKey: session.threadKey,
		});
		run?.resolveSessionId(session.sessionId);
		await onAgentReady?.();

		const abortController = new AbortController();
		let finalText = "";
		let pendingText = "";
		let lastPreview: unknown;
		let reasoningStreamId: string | undefined;
		const toolLabels = new Map<string, string>();
		const toolInputs = new Map<string, Record<string, unknown>>();
		// The previous turn's tail (step/turn.completed, session.waiting) lands
		// AFTER input.requested, past where the last run stopped consuming — so it
		// replays at the start of this run's stream. Ignore terminal events until
		// this turn's own turn.started arrives, or a stale session.waiting ends
		// the run before the resumed turn's events ever show up.
		let turnStarted = false;

		try {
			// Eve resumes turns asynchronously: right after posting a message or
			// input response the session can still look idle, and the event stream
			// closes with nothing. Reconnect through that window instead of
			// returning an empty turn; give up only after sustained silence.
			let idleRetries = 0;
			while (idleRetries < 20) {
				let sawEvent = false;
				try {
					for await (const event of streamEveEvents({
						auth,
						session,
						signal: abortController.signal,
					})) {
						sawEvent = true;
						session.state.streamIndex += 1;
						session.state.lastEventAt = Date.now();
						if (run?.stop) {
							abortController.abort();
							await updateState({
								orgId: org.id,
								session,
								state: { status: "waiting" },
							});
							return {
								env,
								finishReason: "stopped",
								stopReason: run.stop.reason,
								text: finalText,
							};
						}

						if (event.type === "turn.started") {
							turnStarted = true;
							// A follow-up turn must not inherit the prior turn's preview,
							// or a preview-less turn ends on a stale catalog decision.
							lastPreview = undefined;
						} else if (event.type === "step.started") {
							if (turnStarted) onThinking?.();
						} else if (event.type === "actions.requested") {
							const actions = (event.data?.actions ?? []) as EveAction[];
							for (const action of actions) {
								const label = displayEveToolLabel(action);
								// Utility tools (date converters) aren't worth a status blip.
								const silent = action.toolName && isSilentTool(action.toolName);
								if (turnStarted && !silent) await onAction?.(label);
								if (action.callId) {
									toolLabels.set(action.callId, label);
									if (action.input && typeof action.input === "object") {
										toolInputs.set(
											action.callId,
											action.input as Record<string, unknown>,
										);
									}
								}
							}
						} else if (event.type === "action.result") {
							const result = event.data?.result as EveActionResult | undefined;
							if (
								event.data?.status === "completed" &&
								result?.toolName &&
								isPreviewToolName(result.toolName)
							) {
								// Enriched (variant/version flags forced) so the approval card and
								// the suspension-point decision gate both see the full preview.
								// Returning mid-turn here would abandon the still-running eve
								// turn — the decision gate lives at the updateCatalog suspension
								// in streamWebChat, the one point that pauses the run for real.
								lastPreview = await enrichCatalogPreview({
									executeTool: (call) =>
										executeAutumnMcpTool({ env, token, ...call }),
									input: result.callId
										? toolInputs.get(result.callId)
										: undefined,
									preview: parsePreviewPayload(result.output) ?? result.output,
								});
							}
							if (result?.callId) {
								// actions.requested already surfaced this tool as a step;
								// onAction here again would render every call twice. Only
								// surface results that never had a requested event.
								if (turnStarted && !toolLabels.has(result.callId)) {
									await onAction?.(displayEveToolLabel(labelForResult(result)));
								}
								toolLabels.delete(result.callId);
							}
						} else if (event.type === "message.appended" && turnStarted) {
							const messageSoFar = event.data?.messageSoFar;
							pendingText =
								typeof messageSoFar === "string"
									? messageSoFar
									: `${pendingText}${String(event.data?.messageDelta ?? "")}`;
							reasoningStreamId ??= crypto.randomUUID();
							onReasoning?.({ id: reasoningStreamId, text: pendingText });
						} else if (event.type === "message.completed" && turnStarted) {
							const message = String(event.data?.message ?? pendingText);
							pendingText = "";
							if (event.data?.finishReason === "tool-calls") {
								reasoningStreamId ??= crypto.randomUUID();
								onReasoning?.({ id: reasoningStreamId, text: message });
							} else {
								if (reasoningStreamId) {
									onReasoning?.({ id: reasoningStreamId, text: "" });
								}
								finalText = message;
							}
							reasoningStreamId = undefined;
						} else if (event.type === "input.requested" && turnStarted) {
							const requests = (event.data?.requests ??
								[]) as EveInputRequest[];
							// Eve's built-in `ask_question` also carries a populated
							// `action.toolName` (its own), so exclude it — only a real
							// approval-gated tool call should render as an approval card.
							const approval = requests.find(
								(request) =>
									request.requestId &&
									request.action?.toolName &&
									normalizeToolName(request.action.toolName) !== "ask_question",
							);
							if (approval?.requestId && approval.action?.toolName) {
								await updateState({
									orgId: org.id,
									session,
									state: { status: "waiting" },
								});
								const options = approvalOptionIds(approval);
								return {
									env,
									runId: session.sessionId,
									text: finalText,
									suspension: {
										toolCallId: approval.requestId,
										toolName: approval.action.toolName,
										toolArgs: {
											...(approval.action.input ?? {}),
											_eveApproveOptionId: options.approve,
											_eveDenyOptionId: options.deny,
										},
										preview: parsePreviewPayload(lastPreview),
									},
								};
							}
							finalText =
								textForInputRequests(requests) || "Eve is waiting for input.";
							await updateState({
								orgId: org.id,
								session,
								state: { status: "waiting" },
							});
							// Surface the first optioned question structurally so rich surfaces
							// can render answer buttons; `text` keeps the flat fallback.
							const optioned = requests.find(
								(request) => (request.options?.length ?? 0) > 0,
							);
							return {
								env,
								runId: session.sessionId,
								text: finalText,
								question:
									optioned?.prompt && optioned.options && optioned.requestId
										? {
												options: optioned.options,
												prompt: optioned.prompt,
												requestId: optioned.requestId,
											}
										: undefined,
							};
						} else if (
							turnStarted &&
							(event.type === "turn.failed" || event.type === "session.failed")
						) {
							await updateState({
								orgId: org.id,
								session,
								state: { status: "failed" },
							});
							throw new Error(String(event.data?.message ?? "Eve failed"));
						} else if (
							turnStarted &&
							(event.type === "session.waiting" ||
								event.type === "session.completed")
						) {
							if (pendingText) finalText = pendingText;
							await updateState({
								orgId: org.id,
								session,
								state: {
									status:
										event.type === "session.completed"
											? "completed"
											: "waiting",
								},
							});
							// The model may (correctly) stop after a preview that needs
							// versioning/variant/migration choices — surface the decision
							// card now that the turn is genuinely over.
							const decisionPlan = catalogPlanNeedingDecision(lastPreview);
							return {
								env,
								runId: session.sessionId,
								text: finalText,
								catalogDecision: decisionPlan
									? { plan: decisionPlan }
									: undefined,
							};
						}

						if (session.state.streamIndex % 10 === 0) {
							await upsertEveSession({
								db,
								env,
								orgId: org.id,
								sessionId: session.sessionId,
								state: session.state,
								threadKey: session.threadKey,
							});
						}
					}
				} catch (error) {
					if (!(error instanceof EveStreamIdleTimeoutError)) throw error;
					// Silence this long means the cursor drifted past eve's replay
					// buffer or the turn died without a terminal event — heal the
					// cursor and fail visibly rather than spin forever.
					logger.warn("Eve stream went idle; resyncing cursor", {
						event: "leaf.eve_stream_idle_timeout",
						data: {
							session_id: session.sessionId,
							stream_index: session.state.streamIndex,
						},
					});
					await resyncEveStreamIndex({ auth, session });
					await updateState({
						orgId: org.id,
						session,
						state: { status: "waiting" },
					});
					const partialText = finalText || pendingText;
					if (partialText) {
						return { env, runId: session.sessionId, text: partialText };
					}
					throw new Error(
						"Eve stopped responding mid-turn — please send your message again.",
					);
				}
				idleRetries = sawEvent ? 0 : idleRetries + 1;
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		} finally {
			abortController.abort();
		}

		if (pendingText) finalText = pendingText;
		await updateState({
			orgId: org.id,
			session,
			state: { status: "waiting" },
		});
		return { env, runId: session.sessionId, text: finalText };
	},
};
