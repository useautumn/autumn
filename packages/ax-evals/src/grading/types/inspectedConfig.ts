import type { ApiPlanParams } from "../../../../atmn/src/lib/transforms/sdkToApi/plan.ts";

/**
 * Everything scorers need, extracted from the workspace BEFORE it is deleted.
 * Plans are canonicalized to the API wire shape (snake_case ApiPlanParams) —
 * the stable seam — so outcome specs never depend on atmn's TS surface.
 */
export type InspectedConfig = {
	configFound: boolean;
	parseError?: string;
	validationErrors?: string[];
	plans: ApiPlanParams[];
	features: { id: string; type: string }[];
};
