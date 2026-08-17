import {
	feature as baseFeature,
	plan as basePlan,
	billingControls,
	item,
} from "./builders/builderFunctions.js";
import { referralProgram, reward } from "./builders/rewardFunctions.js";
import { createVariant } from "./builders/variantFunctions.js";
import type { Feature } from "./models/featureModels.js";
import type {
	BillingControls,
	FreeTrial,
	PlanItem,
	PlanLicense,
} from "./models/planModels.js";
import type { ReferralProgram, Reward } from "./models/rewardModels.js";
import type {
	CustomizePlan,
	Plan,
	PlanItemFilter,
	Variant,
} from "./models/variantModels.js";

export { billingControls, plan, feature, item, referralProgram, reward };

export type {
	BillingControls,
	CustomizePlan,
	Feature,
	FreeTrial,
	Plan,
	PlanItem,
	PlanItemFilter,
	PlanLicense,
	Variant,
	ReferralProgram,
	Reward,
};

type PlanInput = Omit<
	Plan,
	"description" | "addOn" | "autoEnable" | "group" | "variant"
> &
	Partial<Pick<Plan, "description" | "addOn" | "autoEnable" | "group">>;
type PlanWithVariantMethod = Plan & { variant: NonNullable<Plan["variant"]> };

const plan = (params: PlanInput): PlanWithVariantMethod => {
	const base = basePlan(params) as PlanWithVariantMethod;
	Object.defineProperty(base, "__atmnType", {
		value: "plan",
		enumerable: false,
	});

	Object.defineProperty(base, "variant", {
		value: (variantParams: Omit<Variant, "__atmnType">): Variant => {
			const planVariant = createVariant(variantParams);
			Object.defineProperty(planVariant, "__atmnType", {
				value: "variant",
				enumerable: false,
			});
			base.variants = [...(base.variants ?? []), planVariant];
			return planVariant;
		},
		enumerable: false,
	});

	return base;
};

const feature = (params: Feature): Feature => {
	const value = baseFeature(params);
	Object.defineProperty(value, "__atmnType", {
		value: "feature",
		enumerable: false,
	});
	return value;
};

export type Infinity = "infinity";

// CLI types

export type AutumnConfig = {
	plans: Plan[];
	features: Feature[];
};
