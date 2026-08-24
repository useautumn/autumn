import { db } from "../../../../lib/db.js";
import { autumnOrgContextService } from "../../../autumnMcp/orgContextService.js";
import { isInternalAutumnSlackProvider } from "../../../slackAdmin/provider.js";
import type {
	AgentTurnContext,
	AgentTurnParams,
} from "../../domain/agentTurnContext.js";
import { EveSessionGoneError } from "../../eve/client.js";
import type { EveAuthContext } from "../../eve/types.js";
import {
	generateThreadTitle,
	persistThreadTitle,
} from "../../sessions/agentThreadTitle.js";
import { consumeAgentTurn } from "./execute/consumeAgentTurn.js";
import { resolveAgentTurnOutcome } from "./finalize/resolveAgentTurnOutcome.js";
import { buildAgentTurnMessage } from "./setup/buildAgentTurnMessage.js";
import { prepareAgentTurn } from "./setup/prepareAgentTurn.js";
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

	try {
		const { existingSession, orgContext, withdrawal } = await prepareAgentTurn({
			auth,
			context: ctx,
		});
		const preparedAt = Date.now();
		const startTurn = (start: {
			orgContext?: typeof orgContext;
			session?: typeof existingSession;
			withdrawal?: typeof withdrawal;
		}) =>
			startAgentTurn({
				auth: { ...auth, orgInstructions: start.orgContext?.instructions },
				env,
				message: buildAgentTurnMessage({
					env,
					isAdminInstall: isInternalAutumnSlackProvider({
						provider: thread.provider,
					}),
					newSession: !start.session,
					orgContext: start.orgContext,
					orgSlug: org.slug,
					params,
				}),
				orgId: org.id,
				params,
				session: start.session,
				thread,
				withdrawal: start.withdrawal,
			});
		let session: Awaited<ReturnType<typeof startAgentTurn>>;
		try {
			session = await startTurn({
				orgContext,
				session: existingSession,
				withdrawal,
			});
		} catch (error) {
			if (!(existingSession && error instanceof EveSessionGoneError)) {
				throw error;
			}
			// Eve lost the session; its row was already deleted at the failed
			// post, and its parked writes died with it — restart fresh.
			logger.warn("Eve session gone at message post; starting fresh", {
				event: "leaf.eve_session_gone_restarted",
				data: { session_id: existingSession.sessionId },
			});
			session = await startTurn({
				orgContext: await autumnOrgContextService.load({
					env,
					logger,
					orgId: org.id,
					token,
				}),
			});
		}
		run?.resolveSessionId(session.sessionId);
		const outcome = await consumeAgentTurn({
			auth,
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
