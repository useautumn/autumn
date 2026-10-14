import {
	type AttachParamsV1,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	isProductPaidAndRecurring,
	resolveFreeTrialParam,
	type TrialContext,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	applyProductTrialConfig,
	handleFreeTrialParam,
	inheritTrialFromSubscription,
} from "@/internal/billing/v2/setup/trialContext";
import { isAttachUpgrade } from "../utils/isAttachUpgrade";

export const setupAttachTrialContext = async ({
	ctx,
	params,
	currentContext,
}: {
	ctx: AutumnContext;
	params: AttachParamsV1;
	currentContext: {
		fullCustomer: FullCustomer;
		attachProduct: FullProduct;
		stripeSubscription?: Stripe.Subscription;
		currentEpochMs: number;
		currentCustomerProduct?: FullCusProduct;
	};
}): Promise<TrialContext | undefined> => {
	const {
		fullCustomer,
		attachProduct,
		stripeSubscription,
		currentEpochMs,
		currentCustomerProduct,
	} = currentContext;

	const freeTrialParams = resolveFreeTrialParam(params);
	if (freeTrialParams !== undefined) {
		return handleFreeTrialParam({
			freeTrialParams,
			stripeSubscription,
			fullProduct: attachProduct,
			currentEpochMs,
		});
	}

	const isUpgrade = isAttachUpgrade({
		currentCustomerProduct,
		attachProduct,
	});

	const newProductIsPaidRecurring = isProductPaidAndRecurring(attachProduct);
	if (newProductIsPaidRecurring && stripeSubscription && !isUpgrade) {
		return inheritTrialFromSubscription({ stripeSubscription });
	}

	return applyProductTrialConfig({
		ctx,
		fullProduct: attachProduct,
		fullCustomer,
		stripeSubscription,
		currentEpochMs,
	});
};
