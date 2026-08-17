import type {
	AgentTurnContext,
	AgentTurnParams,
} from "../../domain/agentTurnContext.js";
import type { EveAuthContext } from "../../eve/types.js";
import {
	generateThreadTitle,
	persistThreadTitle,
} from "../../sessions/agentThreadTitle.js";
import { db } from "../../../../lib/db.js";
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

	try {
		const { existingSession, orgContext } = await prepareAgentTurn({
			auth,
			context: ctx,
		});
		const session = await startAgentTurn({
			auth,
			env,
			message: buildAgentTurnMessage({
				env,
				newSession: !existingSession,
				orgContext,
				params,
			}),
			orgId: org.id,
			params,
			session: existingSession,
			thread,
		});
		run?.resolveSessionId(session.sessionId);
		const outcome = await consumeAgentTurn({
			auth,
			env,
			logger,
			onAction,
			onReasoning,
			onThinking,
			orgId: org.id,
			run,
			session,
			token,
		});

		return await resolveAgentTurnOutcome({
			env,
			logger,
			orgId: org.id,
			outcome,
			session,
		});
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
