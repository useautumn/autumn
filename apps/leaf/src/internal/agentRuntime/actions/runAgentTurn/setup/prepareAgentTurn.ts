import { autumnOrgContextService } from "../../../../autumnMcp/orgContextService.js";
import { db } from "../../../../../lib/db.js";
import type { AgentTurnContext } from "../../../domain/agentTurnContext.js";
import { getEveSession } from "../../../eve/repo.js";
import { withdrawSupersededApprovals } from "../../../../approvals/actions/withdrawSupersededApprovals.js";
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

	await withdrawSupersededApprovals({
		auth,
		logger,
		onApprovalsSuperseded,
		orgId: org.id,
		providerUserId,
		session: existingSession,
		thread,
	});
	return { existingSession, orgContext: undefined } as const;
};
