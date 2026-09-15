import type { LintRule } from "../runtime/lintDocument";
import {
	exactlyOneActive,
	exists,
	linkedOnce,
	targetHas,
	targetLacks,
	unique,
	valueWhen,
} from "./define";

export const planItemRules: LintRule[] = [
	exists({
		field: "featureId",
		in: "features",
		matching: "featureId",
		because: "A plan item meters a feature this config does not declare.",
	}),
	targetHas({
		when: "featureOverride",
		field: "featureId",
		in: "features",
		matching: "featureId",
		target: "type",
		equals: "credit_system",
		because:
			"featureOverride is only honoured on classic credit-system features.",
	}),
	targetLacks({
		field: "featureId",
		in: "features",
		matching: "featureId",
		target: "archived",
		label: "Feature",
		parentGuard: "archived",
		parentIdField: "planId",
		parentLabel: "plan",
		because:
			"An archived feature should not gain new customers through a live plan.",
	}),
];

export const planItemPriceRules: LintRule[] = [
	valueWhen({
		when: "tierBehavior",
		equals: "volume",
		field: "billingMethod",
		mustBe: "prepaid",
		because: "Volume tiers are prepaid-only.",
	}),
];

export const planRules: LintRule[] = [
	unique({
		field: "internalId",
		because:
			"A stable id names exactly one row; two fixtures cannot both be it.",
	}),
	unique({
		field: "planId",
		alongside: "versionSlug",
		because: "A plan id plus a version slug names exactly one version.",
	}),
	linkedOnce({
		groupBy: "planId",
		namedBy: "versionSlug",
		absentMeans: "v1",
		collection: "variants",
		identity: "variantPlanId",
		pins: ["versionSlug", "version"],
		because:
			"When versioning a base plan with variants linked, you also need to version the variant, and relink the new version to the new variant version.",
	}),
	exactlyOneActive({
		groupBy: "planId",
		field: "active",
		label: "Plan",
		because:
			"Every version of a plan lives in plans; mark the one customers can buy active: true and the rest active: false.",
	}),
];
