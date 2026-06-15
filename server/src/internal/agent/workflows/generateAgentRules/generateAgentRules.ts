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
	const rules = AgentRulesSchema.parse({
		credit_rules: creditResult.creditRules,
		entity_rules: entityResult.entityRules,
		notes: "",
	});

	ctx.logger.info(
		{
			data2: {
				env: ctx.env,
				org_id: ctx.org.id,
				org_slug: ctx.org.slug,
				rules,
				time_range: { endTime, startTime },
				unconfigured:
					entityResult.unconfigured || creditResult.unconfigured || undefined,
			},
		},
		"[AgentRules] Generated rules",
	);

	return {
		rules,
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
