import {
	type BillingContext,
	type FullCusProduct,
	isAllocatedV2CustomerEntitlement,
	type LineItem,
	type UpdateCustomerEntitlement,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeCycleBalanceResets } from "@/internal/billing/v2/compute/computeAutumnUtils/computeCycleBalanceResets";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems";
import { customerProductToLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems";
import { getRefundLineItems } from "@/internal/billing/v2/utils/lineItems/getRefundLineItems";

export const computeSharedSubscriptionResetBilling = ({
	ctx,
	billingContext,
	customerProduct,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	customerProduct: FullCusProduct;
}): {
	lineItems: LineItem[];
	updateCustomerEntitlements: UpdateCustomerEntitlement[];
} => {
	const arrear = customerProductToArrearLineItems({
		ctx,
		customerProduct,
		billingContext,
		filters: {
			cusEntFilter: (cusEnt) => !isAllocatedV2CustomerEntitlement(cusEnt),
		},
		options: {
			includePeriodDescription: true,
			updateNextResetAt: true,
			invoiceCredits: {},
		},
	});
	const priceFilters = { excludeOneOffPrices: true };

	return {
		lineItems: [
			...arrear.lineItems,
			...arrear.invoiceCreditLineItems,
			...getRefundLineItems({
				ctx,
				customerProduct,
				billingContext,
				priceFilters,
			}),
			...customerProductToLineItems({
				ctx,
				customerProduct,
				billingContext,
				direction: "charge",
				priceFilters,
			}),
		],
		updateCustomerEntitlements: [
			...arrear.updateCustomerEntitlements,
			...computeCycleBalanceResets({ billingContext, customerProduct }),
		],
	};
};
