import { db } from "../../../../../lib/db.js";
import { withdrawSupersededApprovals } from "../../../../approvals/actions/withdrawSupersededApprovals.js";
import { autumnOrgContextService } from "../../../../autumnMcp/orgContextService.js";
import type { AgentTurnContext } from "../../../domain/agentTurnContext.js";
import { getEveSession } from "../../../eve/repo.js";
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
	const loadOrgContext = () =>
		autumnOrgContextService.load({ env, logger, orgId: org.id, token });
	const existingSession =
		context.eveSession ??
		(await getEveSession({ db, env, orgId: org.id, thread }));

	if (!existingSession) {
		await onAction?.("Loading context");
		return {
			existingSession: undefined,
			orgContext: await loadOrgContext(),
			withdrawal: undefined,
		} as const;
	}

	// Pending cards are cancelled here; their deny responses ride the message
	// post itself, so superseding costs no separate eve turn. A session eve has
	// lost surfaces at that post and is recovered there.
	const { withdrawal } = await withdrawSupersededApprovals({
		auth,
		logger,
		onApprovalsSuperseded,
		orgId: org.id,
		providerUserId,
		session: existingSession,
		thread,
	});
	return { existingSession, orgContext: undefined, withdrawal } as const;
};
