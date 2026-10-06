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

/**
 * Restarts a plan the request didn't change on a subscription whose cycle resets now, as Stripe does for
 * every item: unused time credited, a full new period charged, accrued usage billed and balances refilled.
 */
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
		// Allocated v2 holdings carry into the new period and bill at its end, as on a plan switch.
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
