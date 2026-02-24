import { isAllocatedFeature } from "@utils/featureUtils/classifyFeature/isAllocatedFeature";
import { isConsumableFeature } from "@utils/featureUtils/classifyFeature/isConsumableFeature";
import { findFeatureById } from "@utils/featureUtils/findFeatureUtils";

export * from "./apiFeatureToDbFeature";

export * from "./convertFeatureUtils";
export * from "./creditSystemUtils";
export * from "./findFeatureUtils";

export const featureUtils = {
	isConsumable: isConsumableFeature,
	isAllocated: isAllocatedFeature,

	find: {
		byId: findFeatureById,
	},
};
