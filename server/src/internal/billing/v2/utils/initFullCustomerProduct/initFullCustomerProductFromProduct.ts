import {
	addDuration,
	type ExistingRolloversConfig,
	type ExistingUsagesConfig,
	type FeatureOptions,
	FreeTrialDuration,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	findFeatureByIdOrInternalId,
	type InitFullCustomerProductContext,
	isPrepaidPrice,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initFullCustomerProduct } from "./initFullCustomerProduct";

export const initFullCustomerProductFromProduct = ({
	ctx,
	initContext,
}: {
	ctx: AutumnContext;
	initContext: {
		fullCustomer: FullCustomer;
		fullProduct: FullProduct;
		currentEpochMs: number;
		featureQuantities?: FeatureOptions[];

		existingUsagesConfig?: ExistingUsagesConfig;
		existingRolloversConfig?: ExistingRolloversConfig;
	};
}): FullCusProduct => {
	const { fullCustomer, fullProduct, currentEpochMs } = initContext;

	const freeTrial = fullProduct.free_trial ?? null;
	let trialEndsAt: number | undefined;
	// const now = initOptions?.currentEpochMs ?? Date.now();

	if (freeTrial) {
		trialEndsAt = addDuration({
			now: currentEpochMs,
			durationType: freeTrial.duration ?? FreeTrialDuration.Day,
			durationLength: freeTrial.length ?? 1,
		});
	}

	const featureQuantities: FeatureOptions[] = [];
	const prices = fullProduct.prices;

	for (const price of prices) {
		if (isPrepaidPrice(price)) {
			const feature = findFeatureByIdOrInternalId({
				features: ctx.features,
				featureIdOrInternalId: price.config.feature_id,
			});

			if (!feature) continue;

			featureQuantities.push({
				feature_id: feature.id,
				internal_feature_id: feature.internal_id,
				quantity: 0,
			});
		}
	}

	const newInitContext: InitFullCustomerProductContext = {
		fullCustomer,
		fullProduct,
		featureQuantities,
		resetCycleAnchor: "now",
		freeTrial,
		trialEndsAt,
		now: currentEpochMs,

		existingUsagesConfig,
		existingRolloversConfig,
	};

	return initFullCustomerProduct({
		ctx,
		initContext: newInitContext,
		initOptions: {},
	});
};
