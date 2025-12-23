import {
	findFeatureOptionsByFeature,
	InternalError,
	OngoingCusProductActionEnum,
	type SubscriptionUpdateV0Params,
	secondsToMs,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "../../compute/computeAutumnUtils/buildAutumnLineItems";
import type { SubscriptionUpdateQuantityPlan } from "../../typesOld";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";
import { buildStripeSubscriptionAction } from "./buildStripeSubscriptionAction";
import { computeInvoiceAction } from "./computeInvoiceAction";
import { computeQuantityUpdateDetails } from "./computeQuantityUpdateDetails";
import { SubscriptionUpdateIntentEnum } from "./computeSubscriptionUpdateSchema";

export const computeSubscriptionUpdateQuantityPlan = ({
	ctx,
	updateSubscriptionContext,
	params,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionContext;
	params: SubscriptionUpdateV0Params;
}): SubscriptionUpdateQuantityPlan => {
	const { customerProduct, stripeSubscription, testClockFrozenTime } =
		updateSubscriptionContext;

	if (!stripeSubscription) {
		throw new InternalError({
			message: `[Subscription Update] Stripe subscription not found`,
		});
	}

	const featureQuantities = {
		old: customerProduct.options,
		new: params.options || [],
	};

	const quantityUpdateDetails = featureQuantities.new.map((updatedOption) => {
		const previousOption = findFeatureOptionsByFeature({
			featureOptions: customerProduct.options,
			featureId: updatedOption.feature_id,
		});

		return computeQuantityUpdateDetails({
			ctx,
			previousOptions: previousOption,
			updatedOptions: updatedOption,
			updateSubscriptionContext,
		});
	});

	const invoiceAction = computeInvoiceAction({
		quantityUpdateDetails,
		updateSubscriptionContext,
		shouldGenerateInvoiceOnly: !(params.finalize_invoice ?? true),
	});

	const billingCycleAnchor = secondsToMs(
		stripeSubscription.billing_cycle_anchor,
	);

	const ongoingCusProductAction = {
		action: OngoingCusProductActionEnum.Update,
		cusProduct: customerProduct,
	};

	const autumnLineItems = buildAutumnLineItems({
		ctx,
		newCusProducts: [customerProduct],
		ongoingCustomerProduct: ongoingCusProductAction?.cusProduct,
		billingCycleAnchor,
		testClockFrozenTime,
	});

	const stripeSubscriptionAction = buildStripeSubscriptionAction({
		quantityUpdateDetails,
		stripeSubscriptionId: stripeSubscription.id,
	});

	return {
		intent: SubscriptionUpdateIntentEnum.UpdateQuantity,
		featureQuantities,
		quantityUpdateDetails,
		invoiceAction,
		autumnLineItems,
		stripeSubscriptionAction,
		ongoingCusProductAction,
		shouldUncancelSubscription: customerProduct.canceled === true,
	};
};
