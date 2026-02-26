import type {
	Feature,
	FeatureOptions,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

/** Compute updated options array with the top-up packs added. */
export const buildUpdatedOptions = ({
	cusProduct,
	feature,
	topUpPacks,
}: {
	cusProduct: FullCusEntWithFullCusProduct["customer_product"];
	feature: Feature;
	topUpPacks: number;
}): FeatureOptions[] => {
	if (!cusProduct) return [];

	return cusProduct.options.map((opt) => {
		if (
			opt.internal_feature_id === feature.internal_id ||
			opt.feature_id === feature.id
		) {
			return {
				...opt,
				quantity: new Decimal(opt.quantity || 0).add(topUpPacks).toNumber(),
			};
		}
		return opt;
	});
};
