import {
	OngoingCusProductActionEnum,
	type SubscriptionUpdateV0Params,
	secondsToMs,
} from "@shared/index";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "../../compute/computeAutumnUtils/buildAutumnLineItems";
import type { SubscriptionUpdateQuantityPlan } from "../../types";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";
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
	const { options } = params;
	const {
		customerProduct,
		stripeSubscription,
		testClockFrozenTime,
		paymentMethod,
		stripeCustomer,
	} = updateSubscriptionContext;

	const featureQuantities = {
		old: customerProduct.options,
		new: options || [],
	};

	const currentEpochMs = testClockFrozenTime || Date.now();

	const quantityUpdateDetails = featureQuantities.new.map(
		(updatedOption, index) =>
			computeQuantityUpdateDetails({
				ctx,
				previousOptions: featureQuantities.old[index],
				updatedOptions: updatedOption,
				customerProduct,
				stripeSubscription,
				currentEpochMs,
			}),
	);

	const isSubscriptionTrialing = stripeSubscription.status === "trialing";

	const invoiceAction = !isSubscriptionTrialing
		? computeInvoiceAction({
				ctx,
				quantityUpdateDetails,
				stripeSubscription,
				stripeCustomerId: stripeCustomer.id,
				paymentMethod,
				shouldGenerateInvoiceOnly: !(params.finalize_invoice ?? true),
			})
		: undefined;

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

	const stripeSubscriptionAction = {
		type: "update" as const,
		subId: stripeSubscription.id,
		items: quantityUpdateDetails.map((detail) => {
			if (detail.existingStripeSubscriptionItem) {
				return {
					id: detail.existingStripeSubscriptionItem.id,
					quantity: detail.updatedFeatureQuantity,
				};
			}

			return {
				price: detail.stripePriceId,
				quantity: detail.updatedFeatureQuantity,
			};
		}),
	};

	return {
		intent: SubscriptionUpdateIntentEnum.UpdateQuantity,
		customEntitlements: [],
		customPrices: [],
		featureQuantities,
		quantityUpdateDetails,
		isSubscriptionTrialing,
		invoiceAction,
		autumnLineItems,
		stripeSubscriptionAction,
		ongoingCusProductAction,
	};
};
