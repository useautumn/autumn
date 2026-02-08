import type {
	AutumnBillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
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
	const updatedOptions = quantityUpdateDetails.map(
		(detail) => detail.updatedOptions,
	);

	return {
		insertCustomerProducts: [],
		customPrices: [],
		customEntitlements: [],
		updateCustomerProduct: {
			customerProduct,
			updates: {
				options: updatedOptions,
			},
		},

		updateCustomerEntitlements: quantityUpdateDetails.map((detail) => ({
			customerEntitlement: detail.customerEntitlement,
			balanceChange: detail.customerEntitlementBalanceChange,
		})),

		lineItems,
	};
};
