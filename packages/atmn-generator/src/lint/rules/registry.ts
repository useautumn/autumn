import type { LintRule } from "../runtime/lintDocument";
import { featureRules } from "./features";
import { planItemPriceRules, planItemRules, planRules } from "./plans";
import {
	couponRules,
	featureGrantGrantRules,
	referralProgramRules,
	rewardRules,
} from "./rewards";
import { webhookRules } from "./webhooks";

export type RegistryEntry = {
	label?: string;
	idField?: string;
	required?: readonly string[];
	rules?: LintRule[];
};

export const LINT_REGISTRY: Record<string, RegistryEntry> = {
	features: { label: "feature", idField: "featureId", rules: featureRules },
	plans: {
		label: "plan",
		idField: "planId",
		required: ["versionSlug"],
		rules: planRules,
	},
	"plans.variants": {
		label: "variant",
		idField: "variantPlanId",
		required: ["versionSlug"],
	},
	"plans.items": { label: "item", idField: "featureId", rules: planItemRules },
	"plans.items.price": { label: "price", rules: planItemPriceRules },
	"plans.licenses": {
		label: "license",
		idField: "licensePlanId",
		required: ["versionSlug"],
	},
	rewards: { label: "reward", rules: rewardRules },
	"rewards.coupon": { label: "coupon", idField: "id", rules: couponRules },
	"rewards.featureGrant": { label: "feature grant", idField: "id" },
	"rewards.featureGrant.grants": {
		label: "grant",
		idField: "featureId",
		rules: featureGrantGrantRules,
	},
	referralPrograms: {
		label: "referral program",
		idField: "id",
		rules: referralProgramRules,
	},
	webhooks: { label: "webhook", idField: "id", rules: webhookRules },
};
