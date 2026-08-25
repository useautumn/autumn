import { db } from "../../../../../lib/db.js";
import { withdrawSupersededApprovals } from "../../../../approvals/actions/withdrawSupersededApprovals.js";
import { autumnOrgContextService } from "../../../../autumnMcp/orgContextService.js";
import type { AgentTurnContext } from "../../../domain/agentTurnContext.js";
import { getEveSession } from "../../../eve/repo.js";

export const loadAgentOrgContext = ({
	env,
	logger,
	org,
	token,
}: AgentTurnContext) =>
	autumnOrgContextService.load({ env, logger, orgId: org.id, token });

export type PreparedAgentTurn = Awaited<ReturnType<typeof prepareAgentTurn>>;

export const prepareAgentTurn = async (context: AgentTurnContext) => {
	const { env, logger, onAction, onApprovalsSuperseded, org, providerUserId } =
		context;
	const existingSession =
		context.eveSession ??
		(await getEveSession({ db, env, orgId: org.id, thread: context.thread }));

	if (!existingSession) {
		await onAction?.("Loading context");
		return {
			existingSession: undefined,
			orgContext: await loadAgentOrgContext(context),
			withdrawal: undefined,
		} as const;
	}

	const { withdrawal } = await withdrawSupersededApprovals({
		logger,
		onApprovalsSuperseded,
		orgId: org.id,
		providerUserId,
		session: existingSession,
		thread: context.thread,
	});
	return { existingSession, orgContext: undefined, withdrawal } as const;
};
