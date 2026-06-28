import type { Variant } from "../models/variantModels.js";

export const createVariant = (params: Omit<Variant, "__atmnType">): Variant => {
	return params;
};
