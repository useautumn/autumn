import { db } from "../../../../lib/db.js";
import { stalledToolNudge } from "../../../../ui/messages.js";
import { isInternalAutumnSlackProvider } from "../../../slackAdmin/provider.js";
import type {
	AgentTurnContext,
	AgentTurnParams,
} from "../../domain/agentTurnContext.js";
import { postEveMessage } from "../../eve/client.js";
import type { EveAuthContext, EveSessionRef } from "../../eve/types.js";
import {
	generateThreadTitle,
	persistThreadTitle,
} from "../../sessions/agentThreadTitle.js";
import { recoverLostSession } from "./errors/recoverLostSession.js";
import { consumeAgentTurn } from "./execute/consumeAgentTurn.js";
import { resolveAgentTurnOutcome } from "./finalize/resolveAgentTurnOutcome.js";
import { buildAgentTurnMessage } from "./setup/buildAgentTurnMessage.js";
import {
	loadAgentOrgContext,
	type PreparedAgentTurn,
	prepareAgentTurn,
} from "./setup/prepareAgentTurn.js";
import { startAgentTurn } from "./setup/startAgentTurn.js";

export const runAgentTurn = async ({
	ctx,
	params,
	titleSourceText,
}: {
	ctx: AgentTurnContext;
	params: AgentTurnParams;
	titleSourceText?: string;
}) => {
	const {
		env,
		logger,
		onAction,
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
	const titlePromise = titleSourceText?.trim()
		? generateThreadTitle({ logger, text: titleSourceText })
		: undefined;
	const startedAt = Date.now();
	let firstEventAt: number | undefined;
	let restarted = false;

	const startTurn = (prepared: Partial<PreparedAgentTurn>) =>
		startAgentTurn({
			auth: {
				...auth,
				orgCatalog: prepared.orgContext?.text,
				orgInstructions: prepared.orgContext?.instructions,
			},
			env,
			message: buildAgentTurnMessage({
				env,
				isAdminInstall: isInternalAutumnSlackProvider({
					provider: thread.provider,
				}),
				newSession: !prepared.existingSession,
				orgContext: prepared.orgContext,
				orgSlug: org.slug,
				params,
			}),
			orgId: org.id,
			params,
			session: prepared.existingSession,
			thread,
			withdrawal: prepared.withdrawal,
		});
	const startFresh = async () => {
		restarted = true;
		return startTurn({ orgContext: await loadAgentOrgContext(ctx) });
	};
	const consume = (session: EveSessionRef) => {
		run?.resolveSessionId(session.sessionId);
		return consumeAgentTurn({
			auth,
			deadlineAt: ctx.deadlineAt,
			env,
			logger,
			onAction,
			onFirstStreamEvent: () => {
				firstEventAt ??= Date.now();
			},
			onReasoning,
			onThinking,
			orgId: org.id,
			run,
			session,
			token,
		});
	};

	try {
		const prepared = await prepareAgentTurn(ctx);
		const { existingSession } = prepared;
		const preparedAt = Date.now();
		let session = await startTurn(prepared).catch(async (error) => {
			if (!existingSession) throw error;
			await recoverLostSession({
				ctx,
				error,
				existingSession,
				session: existingSession,
			});
			return startFresh();
		});
		let outcome = await consume(session).catch(async (error) => {
			await recoverLostSession({ ctx, error, existingSession, session });
			session = await startFresh();
			return consume(session);
		});
		if (outcome.kind === "deferred") {
			logger.warn("Eve parked holding the message; redelivering", {
				event: "leaf.eve_deferred_input_redelivered",
				data: {
					session_id: session.sessionId,
					stream_index: session.state.streamIndex,
				},
			});
			await postEveMessage({
				auth: { ...auth, orgInstructions: prepared.orgContext?.instructions },
				message: buildAgentTurnMessage({
					env,
					isAdminInstall: isInternalAutumnSlackProvider({
						provider: thread.provider,
					}),
					newSession: false,
					orgSlug: org.slug,
					params,
				}),
				session,
			});
			const redelivered = await consume(session);
			// One redelivery is the fix; a second park is eve failing to consume
			// its own deferred input, and must not read as a fresh deferral.
			outcome =
				redelivered.kind === "deferred" ? { kind: "silent" } : redelivered;
		}
		if (outcome.kind === "stalled") {
			logger.warn("Eve parked on undispatched tool calls; nudging the turn", {
				event: "leaf.eve_stalled_turn_nudged",
				data: {
					session_id: session.sessionId,
					stream_index: session.state.streamIndex,
					tools: outcome.tools,
				},
			});
			await postEveMessage({
				auth: { ...auth, orgInstructions: prepared.orgContext?.instructions },
				message: stalledToolNudge(outcome.tools),
				session,
			});
			const resumed = await consume(session);
			outcome = resumed.kind === "stalled" ? { kind: "silent" } : resumed;
		}
		const result = await resolveAgentTurnOutcome({
			env,
			logger,
			orgId: org.id,
			outcome,
			session,
		});
		logger.info("Agent turn completed", {
			event: "leaf.agent_turn_completed",
			data: {
				duration_ms: Date.now() - startedAt,
				new_session: !existingSession,
				outcome_kind: result.kind,
				prepare_ms: preparedAt - startedAt,
				restarted,
				session_id: session.sessionId,
				time_to_first_event_ms: firstEventAt
					? firstEventAt - startedAt
					: undefined,
			},
		});
		return result;
	} finally {
		if (titlePromise) {
			void persistThreadTitle({
				db,
				env,
				logger,
				orgId: org.id,
				thread,
				titlePromise,
			});
		}
	}
};
