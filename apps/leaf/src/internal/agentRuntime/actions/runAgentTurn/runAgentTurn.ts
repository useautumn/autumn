import { db } from "../../../../lib/db.js";
import type {
	FollowUpMessage,
	RunTransport,
} from "../../../runs/runRegistry.js";
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
import type { EveTurnOutcome } from "./execute/eveTurnReducer.js";
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
				pendingApprovals: prepared.pendingApprovals,
			}),
			orgId: org.id,
			params,
			session: prepared.existingSession,
			thread,
		});
	const startFresh = async () => {
		restarted = true;
		return startTurn({
			orgContext: await loadAgentOrgContext(ctx),
		});
	};
	// A follow-up that lands mid-turn is posted straight into the session: eve
	// steers, and the one reader below sees the replacement turn. It carries
	// the same preamble a fresh turn would, minus attachments (never injected).
	const followUpTransport = ({
		prepared,
		session,
	}: {
		prepared: Partial<PreparedAgentTurn>;
		session: EveSessionRef;
	}): RunTransport => ({
		sendUserMessage: async ({ speaker, text }: FollowUpMessage) => {
			await postEveMessage({
				auth,
				clientContext: params.clientContext,
				message: buildAgentTurnMessage({
					env,
					newSession: false,
					orgSlug: org.slug,
					params: { clientContext: params.clientContext, speaker, text },
					pendingApprovals: prepared.pendingApprovals,
				}),
				session,
			});
		},
	});
	const consume = (
		session: EveSessionRef,
		prepared: Partial<PreparedAgentTurn>,
	) => {
		run?.resolveSessionId(
			session.sessionId,
			followUpTransport({ prepared, session }),
		);
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
		let outcome: EveTurnOutcome;
		try {
			outcome = await consume(session, prepared).catch(async (error) => {
				await recoverLostSession({ ctx, error, existingSession, session });
				session = await startFresh();
				return consume(session, {});
			});
		} finally {
			// Nobody reads the stream past this point: a follow-up posted now
			// would run unread, so the coordinator queues it as a new run.
			run?.settle();
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
