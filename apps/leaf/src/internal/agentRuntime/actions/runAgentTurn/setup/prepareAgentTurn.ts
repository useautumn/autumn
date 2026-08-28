import { db } from "../../../../../lib/db.js";
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
	const { env, onAction, org } = context;
	const existingSession =
		context.eveSession ??
		(await getEveSession({ db, env, orgId: org.id, thread: context.thread }));

	if (!existingSession) {
		await onAction?.("Loading context");
		return {
			existingSession: undefined,
			orgContext: await loadAgentOrgContext(context),
		} as const;
	}

	return { existingSession, orgContext: undefined } as const;
};
