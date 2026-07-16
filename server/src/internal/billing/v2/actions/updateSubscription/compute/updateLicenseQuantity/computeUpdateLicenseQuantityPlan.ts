import type {
	AutumnBillingPlan,
	LineItem,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeCustomerLicenseQuantityChanges } from "@/internal/billing/v2/compute/computeCustomerLicenseQuantityChanges";
import { convergeCustomerLicense } from "@/internal/billing/v2/utils/convergeCustomerLicense";
import { customerLicenseToLineItems } from "@/internal/billing/v2/utils/lineItems/customerLicenseToLineItems";

/**
 * Converges pool paid counts onto the requested totals in place — the parent
 * customer product and seat anchors are untouched. Bills the delta by
 * refunding the current seat+buffer picture and charging the converged one.
 */
export const computeUpdateLicenseQuantityPlan = ({
	ctx,
	updateSubscriptionContext,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
}): AutumnBillingPlan => {
	const { customerProduct, customerLicenseQuantities } =
		updateSubscriptionContext;

	const lineItems: LineItem[] = [];
	const changes = computeCustomerLicenseQuantityChanges({
		customerProduct,
		customerLicenseQuantities,
	});

	for (const { customerLicense, paidQuantity } of changes) {
		lineItems.push(
			...customerLicenseToLineItems({
				ctx,
				billingContext: updateSubscriptionContext,
				customerProduct,
				customerLicense,
				direction: "refund",
			}),
			...customerLicenseToLineItems({
				ctx,
				billingContext: updateSubscriptionContext,
				customerProduct,
				customerLicense: convergeCustomerLicense({
					customerLicense,
					paidQuantity,
				}),
				direction: "charge",
			}),
		);
	}

	return {
		customerId: updateSubscriptionContext.fullCustomer?.id ?? "",
		insertCustomerProducts: [],
		customPrices: [],
		customEntitlements: [],
		customerLicenseUpdates: changes.map(({ update }) => update),
		lineItems,
	};
};
