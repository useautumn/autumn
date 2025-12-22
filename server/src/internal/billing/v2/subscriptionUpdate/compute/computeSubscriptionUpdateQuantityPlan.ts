import {
	OngoingCusProductActionEnum,
	type SubscriptionUpdateV0Params,
	secondsToMs,
} from "@shared/index";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "../../compute/computeAutumnUtils/buildAutumnLineItems";
import type { SubscriptionUpdateQuantityPlan } from "../../types";
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
	const {
		customerProduct,
		stripeSubscription,
		testClockFrozenTime,
		paymentMethod,
	} = updateSubscriptionContext;

	const featureQuantities = {
		old: customerProduct.options,
		new: params.options || [],
	};

	const currentEpochMs = testClockFrozenTime || Date.now();
	const quantityUpdateDetails = featureQuantities.new.map((updatedOption) => {
		const previousOption = featureQuantities.old.find(
			(oldOption) => oldOption.feature_id === updatedOption.feature_id,
		);

		if (!previousOption) {
			throw new Error(
				`[Subscription Update] Cannot find previous options for feature: ${updatedOption.feature_id}. ` +
					`This feature may not exist in the current subscription.`,
			);
		}

		return computeQuantityUpdateDetails({
			ctx,
			previousOptions: previousOption,
			updatedOptions: updatedOption,
			customerProduct,
			stripeSubscription,
			currentEpochMs,
		});
	});

	const invoiceAction = computeInvoiceAction({
		quantityUpdateDetails,
		stripeSubscription,
		paymentMethod,
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
		ongoingCusProductAction,
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
