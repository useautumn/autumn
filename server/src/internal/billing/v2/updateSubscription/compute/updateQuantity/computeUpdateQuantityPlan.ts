import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";
import { computeUpdateQuantityDetails } from "./computeUpdateQuantityDetails";

export const computeUpdateQuantityPlan = ({
	ctx,
	updateSubscriptionContext,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
}): AutumnBillingPlan => {
	const { customerProduct, featureQuantities } = updateSubscriptionContext;

	const newOptions = featureQuantities;

	const quantityUpdateDetails = newOptions.map((updatedOptions) =>
		computeUpdateQuantityDetails({
			ctx,
			updatedOptions,
			updateSubscriptionContext,
		}),
	);

	const lineItems = quantityUpdateDetails.flatMap((detail) => detail.lineItems);

	return {
		insertCustomerProducts: [],
		customPrices: [],
		customEntitlements: [],
		updateCustomerProduct: {
			...customerProduct,
			options: newOptions,

			// If quantity is being updated, customer product should be uncanceled
			canceled: false,
			canceled_at: null,
			ended_at: null,
		},

		updateCustomerEntitlements: quantityUpdateDetails.map((detail) => ({
			customerEntitlementId: detail.customerEntitlementId,
			balanceChange: detail.customerEntitlementBalanceChange,
		})),

		lineItems,
		// quantityUpdateDetails,
	};
};
