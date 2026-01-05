import {
	cusProductToProduct,
	type SubscriptionUpdateV0Params,
	secondsToMs,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type { UpdateSubscriptionContext } from "@server/internal/billing/v2/subscriptionUpdate/fetch/updateSubscriptionContextSchema";
import { computeSubscriptionUpdateFreeTrialPlan } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeSubscriptionUpdateFreeTrialPlan";
import { computeSubscriptionUpdateNewCustomerProduct } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeSubscriptionUpdateNewCustomerProduct";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";
import { computeCustomFullProduct } from "../../../compute/computeAutumnUtils/computeCustomFullProduct";

export const computeSubscriptionUpdateCustomPlan = async ({
	ctx,
	updateSubscriptionContext,
	params,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionContext;
	params: SubscriptionUpdateV0Params;
}) => {
	const { customerProduct, stripeSubscription } = updateSubscriptionContext;

	const currentFullProduct = cusProductToProduct({
		cusProduct: customerProduct,
	});

	// 1. Compute the custom full product
	const {
		fullProduct: customFullProduct,
		customPrices,
		customEnts,
	} = await computeCustomFullProduct({
		ctx,
		currentFullProduct,
		customItems: params.items,
	});

	updateSubscriptionContext.fullProducts.push(customFullProduct);

	// 2. Compute the custom trial details
	const { freeTrialPlan, customFreeTrial } =
		computeSubscriptionUpdateFreeTrialPlan({
			updateSubscriptionContext,
			params,
			fullProduct: customFullProduct,
		});

	const billingCycleAnchor =
		freeTrialPlan.trialEndsAt ??
		secondsToMs(stripeSubscription?.billing_cycle_anchor);

	const nowMs = updateSubscriptionContext.testClockFrozenTime ?? Date.now();

	// 3. Compute the new customer product
	const newFullCustomerProduct = computeSubscriptionUpdateNewCustomerProduct({
		ctx,
		updateSubscriptionContext,
		params,
		fullProduct: customFullProduct,
		freeTrialPlan,
		billingCycleAnchor,
	});

	// Line items?

	return {
		insertCustomerProducts: [newFullCustomerProduct],
		// updateCustomerProduct: {
		// 	customerProduct: customerProduct,
		// 	updates: {
		// 		status: CusProductStatus.Expired,
		// 	},
		// },
		customPrices: customPrices,
		customEntitlements: customEnts,
		customFreeTrial: customFreeTrial,
		autumnLineItems: [],
		quantityUpdateDetails: [],
	} satisfies AutumnBillingPlan;

	// 4. Create stripe prices
	// const fullCustomer = updateSubscriptionContext.fullCustomer;
	// await createStripeResourcesForProducts({
	// 	ctx,
	// 	fullCustomer,
	// 	fullProducts: [customFullProduct],
	// });

	// // 5. Build subscription schedule action
	// const scheduleAction = buildStripeSubscriptionScheduleAction({
	// 	ctx,
	// 	billingContext: updateSubscriptionContext,
	// 	addCustomerProducts: [newFullCustomerProduct],
	// 	removeCustomerProducts: [customerProduct],
	// 	trialEndsAt: freeTrialPlan.trialEndsAt,
	// 	nowMs,
	// });

	// // 6. Compute Stripe subscription action
	// const stripeSubscriptionAction = buildStripeSubscriptionAction({
	// 	ctx,
	// 	billingContext: updateSubscriptionContext,
	// 	newCustomerProduct: newFullCustomerProduct,
	// 	stripeSubscriptionScheduleAction: scheduleAction,
	// 	freeTrialPlan,
	// 	nowMs,
	// });

	// // 6. Compute subscription schedule action
	// const stripeInvoiceAction = computeInvoiceAction({
	// 	ctx,
	// 	billingContext: updateSubscriptionContext,
	// 	newCustomerProduct: newFullCustomerProduct,
	// 	stripeSubscriptionAction,
	// 	billingCycleAnchor,
	// });

	// const billingPlan: BillingPlan = {
	// 	stripe: {
	// 		subscriptionAction: stripeSubscriptionAction,
	// 		invoiceAction: stripeInvoiceAction,
	// 		subscriptionScheduleAction: scheduleAction,
	// 	},

	// 	autumn: {
	// 		freeTrialPlan,
	// 		insertCustomerProducts: [newFullCustomerProduct],

	// 		updateCustomerProduct: {
	// 			customerProduct: customerProduct,
	// 			updates: {
	// 				status: CusProductStatus.Expired,
	// 			},
	// 		},

	// 		customPrices: customPrices,
	// 		customEntitlements: customEnts,
	// 		customFreeTrial: customFreeTrial,
	// 	},
	// };

	// return billingPlan;
};
