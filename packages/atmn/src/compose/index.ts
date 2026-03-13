import { feature, plan, item } from "./builders/builderFunctions.js";
import type { Feature } from "./models/featureModels.js";
import type { FreeTrial, Plan, PlanItem } from "./models/planModels.js";

export { plan, feature, item };

export type { Feature, Plan, PlanItem, FreeTrial };

export type Infinity = "infinity";

// CLI types

export type AutumnConfig = {
	plans: Plan[];
	features: Feature[];
};
