import { AgentRulesSchema, entities, type EntityRules } from "@autumn/shared";
import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { isAxiomConfigured } from "@/external/axiom/initAxiom.js";
import { queryAxiom } from "@/external/axiom/queryAxiom.js";
import { escapeApl, isBillingUrl } from "@/external/axiom/utils/aplUtils.js";
import {
	axiomNumberFrom,
	getAxiomResultDebug,
	getAxiomMatchData,
} from "@/external/axiom/utils/resultUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const attachScopeApl = ({ ctx }: { ctx: AutumnContext }) =>
	`
['express']
| where isnotnull(statusCode)
| where ['context.org_id'] == '${escapeApl(ctx.org.id)}'
| where ['context.env'] == '${ctx.env}'
| where ${isBillingUrl()}
| summarize total=count(), with_entity=countif(isnotempty(tostring(['req.body']['entity_id'])))
| extend entity_ratio = todouble(with_entity) / todouble(total)
`.trim();

const getTopEntityFeature = async ({ ctx }: { ctx: AutumnContext }) => {
	const rows = await ctx.db
		.select({
			entity_count: count(),
			feature_id: entities.feature_id,
		})
		.from(entities)
		.where(
			and(
				eq(entities.org_id, ctx.org.id),
				eq(entities.env, ctx.env),
				eq(entities.deleted, false),
				isNotNull(entities.id),
				isNotNull(entities.feature_id),
			),
		)
		.groupBy(entities.feature_id)
		.orderBy(desc(count()))
		.limit(1);

	return rows[0] ?? { entity_count: 0, feature_id: "" };
};

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

	const [attachScopeResult, topEntityFeature] = await Promise.all([
		queryAxiom({
			apl: attachScopeApl({ ctx }),
			options: { endTime, startTime },
		}),
		getTopEntityFeature({ ctx }),
	]);

	const attachScope = getAxiomMatchData(attachScopeResult)[0] ?? {};
	const totalAttachCalls = axiomNumberFrom(attachScope.total);
	const entityAttachCalls = axiomNumberFrom(attachScope.with_entity);
	const entityRatio =
		totalAttachCalls > 0 ? entityAttachCalls / totalAttachCalls : 0;

	const hasEntityFeature = Boolean(topEntityFeature.feature_id);
	const inferenceSource =
		totalAttachCalls > 0 ? "axiom_attach_scope" : "entities_fallback";
	const attachToEntities =
		totalAttachCalls > 0 ? entityRatio > 0.5 : hasEntityFeature;
	const entityRules = {
		attach_to_entities: attachToEntities,
		entity_feature_id: attachToEntities
			? (topEntityFeature.feature_id ?? "")
			: "",
	} satisfies EntityRules;

	ctx.logger.info(
		{
			data2: {
				attach_scope: {
					entity_calls: entityAttachCalls,
					ratio: entityRatio,
					total_calls: totalAttachCalls,
				},
				axiom_result: getAxiomResultDebug({ result: attachScopeResult }),
				entity_feature: {
					count: topEntityFeature.entity_count,
					feature_id: topEntityFeature.feature_id ?? "",
					source: "entities",
				},
				entity_rules: entityRules,
				env: ctx.env,
				inference_source: inferenceSource,
				org_id: ctx.org.id,
				org_slug: ctx.org.slug,
				time_range: { endTime, startTime },
			},
		},
		"[AgentRules] Generated entity rules",
	);

	return {
		entityRules,
		metadata: {
			attach_scope: {
				entity_calls: entityAttachCalls,
				ratio: entityRatio,
				total_calls: totalAttachCalls,
			},
			entity_feature: {
				count: topEntityFeature.entity_count,
				feature_id: topEntityFeature.feature_id ?? "",
				source: "entities",
			},
			env: ctx.env,
			generated_from: "axiom",
			inference_source: inferenceSource,
			time_range: { endTime, startTime },
			top_entity_feature_id: entityRules.entity_feature_id,
		},
	};
};
