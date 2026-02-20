import { planParamsV1ToProductV2 } from "@api/products/crud/mappers/planParamsV1ToProductV2";
import { planV0ToProductItems } from "@api/products/mappers/planV0ToProductItems";

export * from "./apiFreeTrial";
export * from "./apiPlanV1";
export * from "./components/apiFreeTrialV2";
export * from "./components/billingMethod";
export * from "./components/display";
export * from "./components/planExpand";
export * from "./crud/index";
export * from "./items/index";
export * from "./mappers/index";
export * from "./planLegacyData";
export * from "./previousVersions/apiPlanV0";
export * from "./previousVersions/apiProduct";
export * from "./productOpModels";
export * from "./productsOpenApi";

// Note: V1.2_ProductChanges.js is NOT exported here to avoid circular deps
// It's only imported directly by versionChangeRegistry.ts

export const apiPlan = {
	map: {
		v0ToProductItems: planV0ToProductItems,
		paramsV1ToProductV2: planParamsV1ToProductV2,
	},
};
