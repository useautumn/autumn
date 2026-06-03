import { isAllocatedFeature } from "@utils/featureUtils/classifyFeature/isAllocatedFeature";
import { isAnyCreditSystem } from "@utils/featureUtils/classifyFeature/isAnyCreditSystem";
import { isConsumableFeature } from "@utils/featureUtils/classifyFeature/isConsumableFeature";
import { findFeatureById } from "@utils/featureUtils/findFeatureUtils";

export * from "./apiFeatureToDbFeature";

export * from "./convertFeatureUtils";
export * from "./creditSystemUtils";
export * from "./findFeatureUtils";

export { isAnyCreditSystem } from "@utils/featureUtils/classifyFeature/isAnyCreditSystem";

export const featureUtils = {
	isConsumable: isConsumableFeature,
	isAllocated: isAllocatedFeature,
	isAnyCreditSystem,

	find: {
		byId: findFeatureById,
	},
};
