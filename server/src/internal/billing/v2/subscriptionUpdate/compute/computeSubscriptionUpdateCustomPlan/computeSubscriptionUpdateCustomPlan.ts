import {
	CusProductStatus,
	cusProductToProduct,
	type SubscriptionUpdateV0Params,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type { UpdateSubscriptionContext } from "@server/internal/billing/v2/subscriptionUpdate/fetch/updateSubscriptionContextSchema";
import type { BillingPlan } from "@/internal/billing/v2/billingPlan";
import { addStripeSubscriptionIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionIdToBillingPlan";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { computeSubscriptionUpdateFreeTrialPlan } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeSubscriptionUpdateFreeTrialPlan";
import { computeSubscriptionUpdateNewCustomerProduct } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeSubscriptionUpdateNewCustomerProduct";
import { computeSubscriptionUpdateStripeSubscriptionAction } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeSubscriptionUpdateStripeSubscriptionAction";
import { logBillingPlan } from "@/internal/billing/v2/utils/logBillingPlan";
import { createStripeResourcesForProducts } from "@/internal/billing/v2/utils/stripeAdapter/createStripeResourcesForProduct";
import { executeStripeSubscriptionAction } from "@/internal/billing/v2/utils/stripeAdapter/subscriptions/executeStripeSubscriptionAction";
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
	const { customerProduct } = updateSubscriptionContext;

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

	// 3. Compute the new customer product
	const newFullCustomerProduct = computeSubscriptionUpdateNewCustomerProduct({
		ctx,
		updateSubscriptionContext,
		params,
		fullProduct: customFullProduct,
		freeTrialPlan,
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

	const billingPlan: BillingPlan = {
		stripe: {
			subscription: stripeSubscriptionAction,
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

	logBillingPlan({ ctx, billingPlan });

	if (stripeSubscriptionAction) {
		const updatedStripeSubscription = await executeStripeSubscriptionAction({
			ctx,
			subscriptionAction: stripeSubscriptionAction,
		});

		if (updatedStripeSubscription) {
			addStripeSubscriptionIdToBillingPlan({
				billingPlan,
				stripeSubscriptionId: updatedStripeSubscription.id,
			});
		}
	}

	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: billingPlan.autumn,
	});

	return billingPlan;
};
