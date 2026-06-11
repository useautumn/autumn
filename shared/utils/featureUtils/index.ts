import { isAiCreditSystem } from "@utils/featureUtils/classifyFeature/isAiCreditSystem";
import { isAllocatedFeature } from "@utils/featureUtils/classifyFeature/isAllocatedFeature";
import { isAnyCreditSystem } from "@utils/featureUtils/classifyFeature/isAnyCreditSystem";
import { isConsumableFeature } from "@utils/featureUtils/classifyFeature/isConsumableFeature";
import { findFeatureById } from "@utils/featureUtils/findFeatureUtils";

export * from "./apiFeatureToDbFeature";

export * from "./convertFeatureUtils";
export * from "./creditSystemUtils";
export * from "./findFeatureUtils";
export * from "./sortFeatures";

export { isAiCreditSystem } from "@utils/featureUtils/classifyFeature/isAiCreditSystem";
export { isAnyCreditSystem } from "@utils/featureUtils/classifyFeature/isAnyCreditSystem";

export const featureUtils = {
	isConsumable: isConsumableFeature,
	isAllocated: isAllocatedFeature,
	isAiCreditSystem,
	isAnyCreditSystem,

	find: {
		byId: findFeatureById,
	},
};
