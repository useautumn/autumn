import type {
	AgentFeature,
	AgentFeatureType,
	AgentPricingConfig,
	AgentProduct,
	AgentProductItem,
	ApiFeatureV1,
	ApiPlanItemV1,
	ApiPlanV1,
} from "@autumn/shared";

const featureType = (type: ApiFeatureV1["type"]): AgentFeatureType => {
	switch (type) {
		case "boolean":
			return "boolean";
		case "credit_system":
			return "credit_system";
		case "ai_credit_system":
			return "ai_credit_system";
		default:
			// "metered" — usage type isn't surfaced here; single_use is the common
			// case and only affects preview labelling.
			return "single_use";
	}
};

const planItem = (item: ApiPlanItemV1): AgentProductItem => ({
	feature_id: item.feature_id,
	included_usage: item.unlimited ? "inf" : item.included,
	interval: item.reset?.interval ?? item.price?.interval ?? null,
	price: item.price?.amount ?? null,
	tiers:
		item.price?.tiers?.map((tier) => ({ to: tier.to, amount: tier.amount })) ??
		null,
	usage_model:
		item.price?.billing_method === "prepaid"
			? "prepaid"
			: item.price?.billing_method === "usage_based"
				? "pay_per_use"
				: null,
	billing_units: item.price?.billing_units ?? null,
});

const planToAgentProduct = (plan: ApiPlanV1): AgentProduct => {
	const basePriceItem: AgentProductItem[] = plan.price
		? [
				{
					feature_id: null,
					price: plan.price.amount,
					interval: plan.price.interval,
					usage_model: null,
				},
			]
		: [];

	return {
		id: plan.id,
		name: plan.name,
		is_add_on: plan.add_on,
		is_default: plan.auto_enable,
		group: plan.group ?? undefined,
		items: [...basePriceItem, ...(plan.items ?? []).map(planItem)],
		free_trial: plan.free_trial
			? {
					length: plan.free_trial.duration_length,
					duration: plan.free_trial.duration_type,
					card_required: plan.free_trial.card_required,
				}
			: null,
	};
};

const featureToAgentFeature = (feature: ApiFeatureV1): AgentFeature => ({
	id: feature.id,
	name: feature.name,
	type: featureType(feature.type),
	credit_schema: feature.credit_schema ?? undefined,
});

/**
 * Render the catalog-preview response (resolved ApiPlan + ApiFeature) into the
 * AgentPricingConfig shape PricingPreview consumes, so the Leaf chat preview pane
 * reuses the onboarding pricing cards.
 */
export const apiPlanToAgentConfig = ({
	plans,
	features,
}: {
	plans: ApiPlanV1[];
	features: ApiFeatureV1[];
}): AgentPricingConfig => ({
	features: features.map(featureToAgentFeature),
	products: plans.map(planToAgentProduct),
});
