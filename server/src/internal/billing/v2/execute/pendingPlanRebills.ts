import {
	cusProductToProduct,
	type FeatureOptions,
	type FullCusProduct,
	type FullProduct,
	featureOptionsAreSame,
	productsAreSame,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

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

	const quantitiesSame = featureOptionsAreSame({
		curFeatureOptions: customerProduct.options ?? [],
		newFeatureOptions: replacementQuantities,
	});

	return !onlyEntsChanged || !freeTrialsSame || !quantitiesSame;
};
