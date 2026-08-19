import { db } from "../../../../../lib/db.js";
import { withdrawSupersededApprovals } from "../../../../approvals/actions/withdrawSupersededApprovals.js";
import { autumnOrgContextService } from "../../../../autumnMcp/orgContextService.js";
import type { AgentTurnContext } from "../../../domain/agentTurnContext.js";
import { deleteEveSession, getEveSession } from "../../../eve/repo.js";
import type { EveAuthContext } from "../../../eve/types.js";

export const prepareAgentTurn = async ({
	auth,
	context,
}: {
	auth: EveAuthContext;
	context: AgentTurnContext;
}) => {
	const {
		env,
		logger,
		onAction,
		onApprovalsSuperseded,
		org,
		providerUserId,
		thread,
		token,
	} = context;
	const existingSession =
		context.eveSession ??
		(await getEveSession({ db, env, orgId: org.id, thread }));

	if (!existingSession) {
		await onAction?.("Loading context");
		return {
			existingSession: undefined,
			orgContext: await autumnOrgContextService.load({ env, logger, token }),
		} as const;
	}

	const { sessionGone } = await withdrawSupersededApprovals({
		auth,
		logger,
		onApprovalsSuperseded,
		orgId: org.id,
		providerUserId,
		session: existingSession,
		thread,
	});
	if (sessionGone) {
		// Eve lost the session; keeping its row would replay the same dead
		// resume on every message, so this turn starts a fresh conversation.
		await deleteEveSession({
			db,
			env,
			orgId: org.id,
			sessionId: existingSession.sessionId,
			threadKey: existingSession.threadKey,
		});
		await onAction?.("Loading context");
		return {
			existingSession: undefined,
			orgContext: await autumnOrgContextService.load({ env, logger, token }),
		} as const;
	}
	return { existingSession, orgContext: undefined } as const;
};
