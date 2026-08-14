import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv, CatalogPlanPreview } from "@autumn/shared";
import type { AgentTurnResult } from "../../domain/agentTurn.js";
import type { AgentThreadRef } from "../../domain/agentTurnContext.js";
import { resolveCatalogDecision } from "./resolveCatalogDecision.js";

export type ResolvedAgentCatalogDecision = Readonly<{
	plan: CatalogPlanPreview;
	source: "approval_redirect" | "turn";
	text: string;
}>;

export const resolveAgentCatalogDecision = async ({
	decisionProvided,
	env,
	getToken,
	logger,
	orgId,
	providerUserId,
	thread,
	turn,
}: {
	decisionProvided: boolean;
	env: AppEnv;
	getToken: () => Promise<string>;
	logger: AutumnLogger;
	orgId: string;
	providerUserId: string;
	thread: AgentThreadRef;
	turn: AgentTurnResult;
}): Promise<ResolvedAgentCatalogDecision | undefined> => {
	if (turn.kind === "catalog_decision") {
		return decisionProvided
			? undefined
			: { plan: turn.plan, source: "turn" as const, text: turn.text };
	}
	if (turn.kind !== "approval") return undefined;

	const plan = await resolveCatalogDecision({
		decisionProvided,
		env,
		getToken,
		logger,
		orgId,
		providerUserId,
		runId: turn.sessionId,
		suspension: turn.approval,
		thread,
	});
	return plan
		? { plan, source: "approval_redirect", text: turn.text }
		: undefined;
};
