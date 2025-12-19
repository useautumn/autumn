import {
	OngoingCusProductActionEnum,
	type SubscriptionUpdateV0Params,
	secondsToMs,
} from "@shared/index";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { cusProductToExistingUsages } from "@/internal/billing/billingUtils/handleExistingUsages/cusProductToExistingUsages";
import { initFullCusProduct } from "@/internal/billing/billingUtils/initFullCusProduct/initFullCusProduct";
import { buildAutumnLineItems } from "../../compute/computeAutumnUtils/buildAutumnLineItems";
import { buildStripeSubAction } from "../../compute/computeStripeUtils/buildStripeSubAction";
import {
	SubscriptionUpdateQuantityAction,
	type SubscriptionUpdateQuantityPlan,
} from "../../types";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";
import { SubscriptionUpdateIntentEnum } from "./computeSubscriptionUpdateSchema";

export const computeSubscriptionUpdateQuantityPlan = (
	ctx: AutumnContext,
	{
		updateSubscriptionContext,
		params,
	}: {
		updateSubscriptionContext: UpdateSubscriptionContext;
		params: SubscriptionUpdateV0Params;
	},
): SubscriptionUpdateQuantityPlan => {
	const { options } = params;
	const {
		customerProduct,
		fullCustomer,
		stripeSubscription,
		testClockFrozenTime,
		product,
		paymentMethod,
	} = updateSubscriptionContext;

	const featureQuantities = {
		old: customerProduct.options,
		new: options || [],
	};

	const isUpgrade =
		featureQuantities.new[0].quantity > featureQuantities.old[0].quantity;

	const action = isUpgrade
		? SubscriptionUpdateQuantityAction.Upgrade
		: SubscriptionUpdateQuantityAction.Downgrade;

	const billingCycleAnchor = secondsToMs(
		stripeSubscription?.billing_cycle_anchor,
	);

	const ongoingCusProductAction = {
		action: OngoingCusProductActionEnum.Expire,
		cusProduct: customerProduct,
	};

	const autumnLineItems = buildAutumnLineItems({
		ctx,
		newCusProducts: [customerProduct],
		ongoingCusProductAction,
		billingCycleAnchor,
		testClockFrozenTime,
	});

	const newCustomerProduct = initFullCusProduct({
		ctx,
		fullCus: fullCustomer,
		initContext: {
			fullCus: fullCustomer,
			product,
			featureQuantities: [],
			replaceables: [],
			existingUsages: cusProductToExistingUsages({
				cusProduct: customerProduct,
			}),
		},
	});

	const stripeSubscriptionAction = buildStripeSubAction({
		ctx,
		stripeSub: stripeSubscription!,
		fullCus: fullCustomer,
		paymentMethod,
		ongoingCusProductAction,
		newCusProducts: [newCustomerProduct],
	});

	return {
		intent: SubscriptionUpdateIntentEnum.UpdateQuantity,
		customEntitlements: [],
		customPrices: [],
		featureQuantities,
		action,
		autumnLineItems,
		stripeSubscriptionAction,
		ongoingCusProductAction,
	};
};
