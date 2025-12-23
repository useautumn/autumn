import {
	CusProductStatus,
	cusProductToProduct,
	type SubscriptionUpdateV0Params,
	secondsToMs,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type { UpdateSubscriptionContext } from "@server/internal/billing/v2/subscriptionUpdate/fetch/updateSubscriptionContextSchema";
import type { BillingPlan } from "@/internal/billing/v2/billingPlan";
import { computeInvoiceAction } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeInvoiceAction";
import { computeSubscriptionUpdateFreeTrialPlan } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeSubscriptionUpdateFreeTrialPlan";
import { computeSubscriptionUpdateNewCustomerProduct } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeSubscriptionUpdateNewCustomerProduct";
import { computeSubscriptionUpdateStripeSubscriptionAction } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeSubscriptionUpdateStripeSubscriptionAction";
import { createStripeResourcesForProducts } from "@/internal/billing/v2/utils/stripeAdapter/createStripeResourcesForProduct";
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

	// 3. Compute the new customer product
	const newFullCustomerProduct = computeSubscriptionUpdateNewCustomerProduct({
		ctx,
		updateSubscriptionContext,
		params,
		fullProduct: customFullProduct,
		freeTrialPlan,
		billingCycleAnchor,
	});

	// 4. Create stripe prices
	const fullCustomer = updateSubscriptionContext.fullCustomer;
	await createStripeResourcesForProducts({
		ctx,
		fullCustomer,
		fullProducts: [customFullProduct],
	});

	// 5. Compute Stripe subscription action
	const stripeSubscriptionAction =
		computeSubscriptionUpdateStripeSubscriptionAction({
			ctx,
			billingContext: updateSubscriptionContext,
			newCustomerProduct: newFullCustomerProduct,
			freeTrialPlan,
		});

	const stripeInvoiceAction = computeInvoiceAction({
		ctx,
		billingContext: updateSubscriptionContext,
		newCustomerProduct: newFullCustomerProduct,
		stripeSubscriptionAction,
		billingCycleAnchor,
	});

	const billingPlan: BillingPlan = {
		stripe: {
			subscriptionAction: stripeSubscriptionAction,
			invoiceAction: stripeInvoiceAction,
		},
		autumn: {
			insertCustomerProducts: [newFullCustomerProduct],

			updateCustomerProduct: {
				customerProduct: customerProduct,
				updates: {
					status: CusProductStatus.Expired,
				},
			},

			customPrices: customPrices,
			customEntitlements: customEnts,
			customFreeTrial: customFreeTrial,
		},
	};

	return billingPlan;

	// logBillingPlan({ ctx, billingPlan });

	// if (stripeInvoiceAction) {
	// 	const result = await executeStripeInvoiceAction({
	// 		ctx,
	// 		billingContext: updateSubscriptionContext,
	// 		stripeInvoiceAction,
	// 	});

	// 	if (result.invoice) {
	// 		await upsertInvoiceFromBilling({
	// 			ctx,
	// 			stripeInvoice: result.invoice,
	// 			fullProducts: [customFullProduct],
	// 			fullCustomer: fullCustomer,
	// 		});
	// 	}
	// }

	// if (stripeSubscriptionAction) {
	// 	const stripeSubscription = await executeStripeSubscriptionAction({
	// 		ctx,
	// 		subscriptionAction: stripeSubscriptionAction,
	// 	});

	// 	if (stripeSubscription) {
	// 		addStripeSubscriptionIdToBillingPlan({
	// 			billingPlan,
	// 			stripeSubscriptionId: stripeSubscription.id,
	// 		});

	// 		// Add subscription to DB
	// 		await upsertSubscriptionFromBilling({
	// 			ctx,
	// 			stripeSubscription,
	// 		});
	// 	}
	// }

	// await executeAutumnBillingPlan({
	// 	ctx,
	// 	autumnBillingPlan: billingPlan.autumn,
	// });

	// return billingPlan;
};
