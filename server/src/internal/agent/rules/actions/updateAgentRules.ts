import { mergeAgentRules, type PartialAgentRules } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { cleanAgentNotes } from "../../workflows/generateAgentRules/cleanAgentNotes.js";
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
	const cleanUpdates =
		updates.notes === undefined
			? updates
			: {
					...updates,
					notes: await cleanAgentNotes({ ctx, notes: updates.notes }),
				};
	const rules = mergeAgentRules({
		base: {
			credit_rules: existing.credit_rules,
			entity_rules: existing.entity_rules,
			notes: existing.notes,
		},
		updates: cleanUpdates,
	});

	return agentRulesRepo.upsert({
		db: ctx.db,
		orgId: ctx.org.id,
		orgSlug: ctx.org.slug,
		rules,
	});
};
