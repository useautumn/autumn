import {
	cusProductToProduct,
	type FeatureOptions,
	type FullCusProduct,
	type FullProduct,
	productsAreSame,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const quantitiesChanged = ({
	current,
	replacement,
}: {
	current: FeatureOptions[];
	replacement: FeatureOptions[];
}) =>
	current.length !== replacement.length ||
	current.some(
		(option) =>
			replacement.find((next) => next.feature_id === option.feature_id)
				?.quantity !== option.quantity,
	);

export const pendingPlanRebills = ({
	ctx,
	customerProduct,
	replacementProduct,
	replacementQuantities,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	replacementProduct?: FullProduct;
	replacementQuantities: FeatureOptions[];
}) => {
	if (!replacementProduct) return true;

	const { onlyEntsChanged, freeTrialsSame } = productsAreSame({
		newProductV1: replacementProduct,
		curProductV1: cusProductToProduct({ cusProduct: customerProduct }),
		features: ctx.features,
	});

	return (
		!onlyEntsChanged ||
		!freeTrialsSame ||
		quantitiesChanged({
			current: customerProduct.options ?? [],
			replacement: replacementQuantities,
		})
	);
};
