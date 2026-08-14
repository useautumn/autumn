import type { AgentEngine } from "../../agent/runMessage/types.js";
import {
	type AutumnOrgContext,
	autumnOrgContextService,
} from "../../internal/autumnMcp/orgContextService.js";
import { db } from "../../lib/db.js";
import { consumeEveTurn } from "./consumeEveTurn.js";
import { getEveSession } from "./repo.js";
import { resolveEveTurnOutcome } from "./resolveTurnOutcome.js";
import { startEveTurn } from "./startTurn.js";
import { withdrawSupersededEveApprovals } from "./supersededApprovals.js";
import { buildEveTurnMessage } from "./turnMessage.js";
import type { EveAuthContext } from "./types.js";

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

		// 1. Resolve the thread's session — a first message has none.
		const existingSession =
			ctx.eveSession ??
			(await getEveSession({ db, env, orgId: org.id, thread }));

		// 2. A resumed thread can carry approval cards the user answered with a
		//    new message instead; a brand-new one needs the org catalog preloaded.
		let orgContext: AutumnOrgContext | undefined;
		if (existingSession) {
			await withdrawSupersededEveApprovals({
				auth,
				logger,
				onApprovalsSuperseded,
				orgId: org.id,
				providerUserId,
				session: existingSession,
				thread,
			});
		} else {
			await onAction?.("Loading context");
			orgContext = await autumnOrgContextService.load({ env, logger, token });
		}

		// 3. Compose and post the turn.
		const session = await startEveTurn({
			auth,
			env,
			message: buildEveTurnMessage({
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
		await onAgentReady?.();

		// 4. Stream it to its end.
		const outcome = await consumeEveTurn({
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

		// 5. Interpret how it ended.
		return await resolveEveTurnOutcome({
			env,
			logger,
			orgId: org.id,
			outcome,
			session,
		});
	},
};
