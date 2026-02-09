import { planV0ToProductItems } from "@api/products/mappers/planV0ToProductItems.js";
import { planV0ToProductV2 } from "@api/products/mappers/planV0ToProductV2.js";

export * from "./apiFreeTrial.js";
export * from "./apiPlanV1.js";
export * from "./components/apiFreeTrialV2.js";
export * from "./components/billingMethod.js";
export * from "./components/display.js";
export * from "./crud/planOpModels.js";
export * from "./items/index.js";
export * from "./mappers/index.js";
export * from "./planLegacyData.js";
export * from "./previousVersions/apiPlanV0.js";
export * from "./previousVersions/apiProduct.js";
export * from "./productOpModels.js";
export * from "./productsOpenApi.js";
// Note: V1.2_ProductChanges.js is NOT exported here to avoid circular deps
// It's only imported directly by versionChangeRegistry.ts

export const apiPlan = {
	map: {
		v0ToProductItems: planV0ToProductItems,
		v0ToProductV2: planV0ToProductV2,
	},
};
