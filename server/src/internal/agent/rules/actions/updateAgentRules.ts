import { mergeAgentRules, type PartialAgentRules } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { agentRulesRepo } from "../repos/index.js";

export const updateAgentRules = async ({
	ctx,
	updates,
}: {
	ctx: AutumnContext;
	updates: PartialAgentRules;
}) => {
	const existing = await agentRulesRepo.get({
		db: ctx.db,
		orgId: ctx.org.id,
	});
	const rules = mergeAgentRules({
		base: {
			credit_rules: existing.credit_rules,
			entity_rules: existing.entity_rules,
			notes: existing.notes,
		},
		updates,
	});

	return agentRulesRepo.upsert({
		db: ctx.db,
		orgId: ctx.org.id,
		orgSlug: ctx.org.slug,
		rules,
	});
};
