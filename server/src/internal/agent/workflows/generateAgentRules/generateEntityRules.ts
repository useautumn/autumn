import { AgentRulesSchema, type EntityRules } from "@autumn/shared";
import { isAxiomConfigured } from "@/external/axiom/initAxiom.js";
import { queryAxiom } from "@/external/axiom/queryAxiom.js";
import { escapeApl } from "@/external/axiom/utils/aplUtils.js";
import {
	axiomNumberFrom,
	axiomStringFrom,
	getAxiomMatchData,
} from "@/external/axiom/utils/resultUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const attachScopeApl = ({ ctx }: { ctx: AutumnContext }) =>
	`
['express']
| where isnotnull(statusCode)
| where ['context.org_id'] == '${escapeApl(ctx.org.id)}'
| where ['context.env'] == '${ctx.env}'
| where (['req.url'] endswith '/v1/billing.attach' or ['req.url'] endswith '/v1/billing.update' or ['req.url'] endswith '/v1/billing.preview_attach' or ['req.url'] endswith '/v1/billing.preview_update' or ['req.url'] endswith '/v1/attach')
| summarize total=count(), with_entity=countif(isnotempty(tostring(['req.body']['entity_id'])))
| extend entity_ratio = todouble(with_entity) / todouble(total)
`.trim();

const entityFeatureApl = ({ ctx }: { ctx: AutumnContext }) =>
	`
['express']
| where isnotnull(statusCode)
| where ['context.org_id'] == '${escapeApl(ctx.org.id)}'
| where ['context.env'] == '${ctx.env}'
| where isnotempty(tostring(['req.body']['entity_id'])) or isnotempty(['context.entity_id']) or isnotempty(['req.entity_id'])
| extend body_feature_id = tostring(['req.body']['feature_id'])
| extend selected_feature_id = case(isnotempty(body_feature_id), body_feature_id, isnotempty(feature_id), feature_id, isnotempty(featureId), featureId, '')
| where isnotempty(selected_feature_id)
| summarize total=count() by selected_feature_id
| top 1 by total
`.trim();

export const generateEntityRules = async ({
	ctx,
	endTime = "now",
	startTime = "now-30d",
}: {
	ctx: AutumnContext;
	endTime?: string;
	startTime?: string;
}): Promise<{
	entityRules: EntityRules;
	metadata: Record<string, unknown>;
	unconfigured?: boolean;
}> => {
	if (!isAxiomConfigured()) {
		const defaults = AgentRulesSchema.parse({
			credit_rules: {},
			entity_rules: {},
			notes: "",
		});
		return {
			entityRules: defaults.entity_rules,
			metadata: { generated_from: "axiom", reason: "axiom_not_configured" },
			unconfigured: true,
		};
	}

	const [attachScopeResult, entityFeatureResult] = await Promise.all([
		queryAxiom({
			apl: attachScopeApl({ ctx }),
			options: { endTime, startTime },
		}),
		queryAxiom({
			apl: entityFeatureApl({ ctx }),
			options: { endTime, startTime },
		}),
	]);

	const attachScope = getAxiomMatchData(attachScopeResult)[0] ?? {};
	const totalAttachCalls = axiomNumberFrom(attachScope.total);
	const entityAttachCalls = axiomNumberFrom(attachScope.with_entity);
	const entityRatio =
		totalAttachCalls > 0 ? entityAttachCalls / totalAttachCalls : 0;

	const entityFeature = getAxiomMatchData(entityFeatureResult)[0] ?? {};
	const attachToEntities = entityRatio > 0.5;
	const entityRules = {
		attach_to_entities: attachToEntities,
		entity_feature_id: attachToEntities
			? axiomStringFrom(entityFeature.selected_feature_id)
			: "",
	} satisfies EntityRules;

	return {
		entityRules,
		metadata: {
			attach_scope: {
				entity_calls: entityAttachCalls,
				ratio: entityRatio,
				total_calls: totalAttachCalls,
			},
			env: ctx.env,
			generated_from: "axiom",
			time_range: { endTime, startTime },
			top_entity_feature_id: entityRules.entity_feature_id,
		},
	};
};
