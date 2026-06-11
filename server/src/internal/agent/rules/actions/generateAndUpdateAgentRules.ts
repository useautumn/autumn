import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateAgentRules } from "../../workflows/generateAgentRules/generateAgentRules.js";
import { agentRulesRepo } from "../repos/index.js";

const mergeGeneratedRules = ({
	existing,
	generated,
}: {
	existing: Awaited<ReturnType<typeof agentRulesRepo.get>>;
	generated: Awaited<ReturnType<typeof generateAgentRules>>["rules"];
}) => {
	const generatedEntityFeatureId = generated.entity_rules.entity_feature_id;

	return {
		credit_rules: {
			credit_feature_id:
				generated.credit_rules.credit_feature_id ||
				existing.credit_rules.credit_feature_id,
		},
		entity_rules: {
			attach_to_entities: generatedEntityFeatureId
				? generated.entity_rules.attach_to_entities
				: existing.entity_rules.attach_to_entities,
			entity_feature_id:
				generatedEntityFeatureId || existing.entity_rules.entity_feature_id,
		},
		notes: existing.notes,
	};
};

export const generateAndUpdateAgentRules = async ({
	ctx,
	endTime,
	startTime,
}: {
	ctx: AutumnContext;
	endTime?: string;
	startTime?: string;
}) => {
	const generated = await generateAgentRules({ ctx, endTime, startTime });
	const existing = await agentRulesRepo.get({
		db: ctx.db,
		orgId: ctx.org.id,
	});
	const rules = await agentRulesRepo.upsert({
		db: ctx.db,
		metadata: generated.metadata,
		orgId: ctx.org.id,
		orgSlug: ctx.org.slug,
		rules: mergeGeneratedRules({
			existing,
			generated: generated.rules,
		}),
	});

	return {
		...rules,
		unconfigured: generated.unconfigured ?? false,
	};
};
