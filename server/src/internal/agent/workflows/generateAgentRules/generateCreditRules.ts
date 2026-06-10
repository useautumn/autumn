import {
	AgentRulesSchema,
	type CreditRules,
	type Feature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { isAxiomConfigured } from "@/external/axiom/initAxiom.js";
import { queryAxiom } from "@/external/axiom/queryAxiom.js";
import { escapeApl } from "@/external/axiom/utils/aplUtils.js";
import {
	axiomStringFrom,
	getAxiomMatchData,
} from "@/external/axiom/utils/resultUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

const trackedFeatureApl = ({ ctx }: { ctx: AutumnContext }) =>
	`
['express']
| where isnotnull(statusCode)
| where ['context.org_id'] == '${escapeApl(ctx.org.id)}'
| where ['context.env'] == '${ctx.env}'
| where (['req.url'] endswith '/v1/track' or ['req.url'] endswith '/v1/events' or ['req.url'] endswith '/v1/balances.track' or ['req.url'] endswith '/v1/check')
| extend body_feature_id = tostring(['req.body']['feature_id'])
| extend selected_feature_id = case(isnotempty(body_feature_id), body_feature_id, isnotempty(feature_id), feature_id, isnotempty(featureId), featureId, '')
| where isnotempty(selected_feature_id)
| summarize total=count() by selected_feature_id
| top 10 by total
`.trim();

const isConsumableCreditSystem = (feature: Feature) =>
	feature.type === FeatureType.CreditSystem &&
	feature.config?.usage_type === FeatureUsageType.Single;

const resolveCreditFeatureId = ({
	features,
	trackedFeatureIds,
}: {
	features: Feature[];
	trackedFeatureIds: string[];
}) => {
	for (const trackedFeatureId of trackedFeatureIds) {
		const trackedFeature = features.find(
			(feature) => feature.id === trackedFeatureId,
		);
		if (!trackedFeature) continue;

		if (isConsumableCreditSystem(trackedFeature)) return trackedFeature.id;
		if (trackedFeature.type !== FeatureType.Metered) continue;

		const creditSystem = getCreditSystemsFromFeature({
			featureId: trackedFeature.id,
			features,
		}).find(isConsumableCreditSystem);

		if (creditSystem) return creditSystem.id;
	}

	return "";
};

const getFeatures = async ({ ctx }: { ctx: AutumnContext }) =>
	ctx.features.length > 0
		? ctx.features
		: FeatureService.list({
				db: ctx.db,
				env: ctx.env,
				orgId: ctx.org.id,
				archived: false,
			});

export const generateCreditRules = async ({
	ctx,
	endTime = "now",
	startTime = "now-30d",
}: {
	ctx: AutumnContext;
	endTime?: string;
	startTime?: string;
}): Promise<{
	creditRules: CreditRules;
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
			creditRules: defaults.credit_rules,
			metadata: { generated_from: "axiom", reason: "axiom_not_configured" },
			unconfigured: true,
		};
	}

	const [trackedFeatureResult, features] = await Promise.all([
		queryAxiom({
			apl: trackedFeatureApl({ ctx }),
			options: { endTime, startTime },
		}),
		getFeatures({ ctx }),
	]);
	const trackedFeatureIds = getAxiomMatchData(trackedFeatureResult).map(
		(match) => axiomStringFrom(match.selected_feature_id),
	);
	const creditRules = {
		credit_feature_id: resolveCreditFeatureId({
			features,
			trackedFeatureIds,
		}),
	} satisfies CreditRules;

	return {
		creditRules,
		metadata: {
			credit_feature_id: creditRules.credit_feature_id,
			generated_from: "axiom",
			top_tracked_feature_ids: trackedFeatureIds,
		},
	};
};
