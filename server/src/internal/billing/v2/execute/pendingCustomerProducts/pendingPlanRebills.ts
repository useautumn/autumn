import {
	cusProductToProduct,
	type FeatureOptions,
	type FreeTrial,
	type FullCusProduct,
	type FullProduct,
	featureOptionsAreSame,
	freeTrialsAreSame,
	productsAreSame,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const pendingPlanRebills = ({
	ctx,
	customerProduct,
	replacementProduct,
	replacementQuantities,
	replacementFreeTrial,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	replacementProduct?: FullProduct;
	replacementQuantities: FeatureOptions[];
	replacementFreeTrial?: FreeTrial | null;
}) => {
	if (!replacementProduct) return true;

	const { onlyEntsChanged } = productsAreSame({
		newProductV1: replacementProduct,
		curProductV1: cusProductToProduct({ cusProduct: customerProduct }),
		features: ctx.features,
	});

	const quantitiesSame = featureOptionsAreSame({
		curFeatureOptions: customerProduct.options ?? [],
		newFeatureOptions: replacementQuantities,
	});

	const freeTrialsSame = freeTrialsAreSame({
		ft1: customerProduct.free_trial,
		ft2: replacementFreeTrial,
	});

	return !onlyEntsChanged || !freeTrialsSame || !quantitiesSame;
};
