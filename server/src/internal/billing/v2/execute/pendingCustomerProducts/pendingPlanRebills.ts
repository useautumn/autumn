import {
	cusProductToProduct,
	type FeatureOptions,
	type FullCusProduct,
	type FullProduct,
	featureOptionsAreSame,
	freeTrialsAreSame,
	productsAreSame,
	type TrialContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const pendingPlanRebills = ({
	ctx,
	customerProduct,
	replacementProduct,
	replacementQuantities,
	replacementTrialContext,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	replacementProduct?: FullProduct;
	replacementQuantities: FeatureOptions[];
	replacementTrialContext?: TrialContext;
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

	// An explicit free_trial lands on the trial context, not the plan.
	const freeTrialsSame = freeTrialsAreSame({
		ft1: customerProduct.free_trial,
		ft2: replacementTrialContext
			? replacementTrialContext.freeTrial
			: replacementProduct.free_trial,
	});

	return !onlyEntsChanged || !freeTrialsSame || !quantitiesSame;
};
