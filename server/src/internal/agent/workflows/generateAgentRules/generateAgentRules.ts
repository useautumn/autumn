import { type AgentRules, AgentRulesSchema } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateCreditRules } from "./generateCreditRules.js";
import { generateEntityRules } from "./generateEntityRules.js";

export const generateAgentRules = async ({
	ctx,
	endTime = "now",
	startTime = "now-30d",
}: {
	ctx: AutumnContext;
	endTime?: string;
	startTime?: string;
}): Promise<{
	rules: AgentRules;
	metadata: Record<string, unknown>;
	unconfigured?: boolean;
}> => {
	const [entityResult, creditResult] = await Promise.all([
		generateEntityRules({ ctx, endTime, startTime }),
		generateCreditRules({ ctx, endTime, startTime }),
	]);

	return {
		rules: AgentRulesSchema.parse({
			credit_rules: creditResult.creditRules,
			entity_rules: entityResult.entityRules,
			notes: "",
		}),
		metadata: {
			credit_rules: creditResult.metadata,
			entity_rules: entityResult.metadata,
			generated_at: Date.now(),
			generated_from: "axiom",
		},
		unconfigured:
			entityResult.unconfigured || creditResult.unconfigured || undefined,
	};
};
