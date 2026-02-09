import { isAllocatedFeature } from "@utils/featureUtils/classifyFeature/isAllocatedFeature.js";
import { isConsumableFeature } from "@utils/featureUtils/classifyFeature/isConsumableFeature.js";
import { findFeatureById } from "@utils/featureUtils/findFeatureUtils.js";

export * from "./apiFeatureToDbFeature.js";

export * from "./convertFeatureUtils.js";
export * from "./creditSystemUtils.js";
export * from "./findFeatureUtils.js";

export const featureUtils = {
	isConsumable: isConsumableFeature,
	isAllocated: isAllocatedFeature,

	find: {
		byId: findFeatureById,
	},
};
