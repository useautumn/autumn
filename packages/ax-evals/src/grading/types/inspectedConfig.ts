import type { ApiPlanParams } from "../../../../atmn-old/src/lib/transforms/sdkToApi/plan.ts";

export type InspectedConfig = {
	configFound: boolean;
	parseError?: string;
	validationErrors?: string[];
	plans: ApiPlanParams[];
	inactivePlans?: ApiPlanParams[];
	variantPlanIds?: string[];
	features: { id: string; type: string }[];
};
