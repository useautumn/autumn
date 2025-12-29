import { InternalError, type SubscriptionUpdateV0Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingPlan } from "../../billingPlan";
import { buildStripeSubscriptionAction } from "../../providers/stripe/actionBuilders/buildStripeSubscriptionAction";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";
import { computeStripeInvoiceAction } from "./computeInvoiceAction";
import { computeQuantityUpdateDetails } from "./computeQuantityUpdateDetails";

export const computeSubscriptionUpdateQuantityPlan = ({
	ctx,
	updateSubscriptionContext,
	params,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionContext;
	params: SubscriptionUpdateV0Params;
}): BillingPlan => {
	const { customerProduct, stripeSubscription, currentEpochMs } =
		updateSubscriptionContext;

	if (!stripeSubscription) {
		throw new InternalError({
			message: `[Subscription Update] Stripe subscription not found`,
		});
	}

	const newOptions = params.options || [];

	const quantityUpdateDetails = newOptions.map((updatedOptions) =>
		computeQuantityUpdateDetails({
			ctx,
			updatedOptions,
			updateSubscriptionContext,
		}),
	);

	const customerProductWithNewOptions = {
		...customerProduct,
		options: newOptions,
	};

	const stripeSubscriptionAction = buildStripeSubscriptionAction({
		ctx,
		billingContext: updateSubscriptionContext,
		newCustomerProduct: customerProductWithNewOptions,
		nowMs: currentEpochMs,
	});

	const stripeInvoiceAction = computeStripeInvoiceAction({
		quantityUpdateDetails,
		updateSubscriptionContext,
		shouldFinalizeInvoice: params.finalize_invoice !== false,
	});

	return {
		autumn: {
			insertCustomerProducts: [],
			customPrices: [],
			customEntitlements: [],
			updateCustomerProduct: {
				customerProduct,
				updates: {
					options: newOptions,
				},
			},
			quantityUpdateDetails,
			shouldUncancelSubscription: customerProduct.canceled === true,
		},
		stripe: {
			subscriptionAction: stripeSubscriptionAction ?? { type: "none" },
			invoiceAction: stripeInvoiceAction,
		},
	};
};
