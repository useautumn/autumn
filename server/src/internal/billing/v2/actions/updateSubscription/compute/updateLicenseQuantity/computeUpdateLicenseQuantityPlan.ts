import type {
	AutumnBillingPlan,
	CustomerLicenseUpdate,
	LineItem,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
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

	const customerLicenseUpdates: CustomerLicenseUpdate[] = [];
	const lineItems: LineItem[] = [];

	for (const quantity of customerLicenseQuantities ?? []) {
		const customerLicense = customerProduct.customer_licenses?.find(
			(pool) => pool.planLicense?.product.id === quantity.licensePlanId,
		);
		if (!customerLicense) continue;

		const included = customerLicense.granted - customerLicense.paid_quantity;
		const paidQuantity = Math.max(0, quantity.totalQuantity - included);
		if (paidQuantity === customerLicense.paid_quantity) continue;

		customerLicenseUpdates.push({
			customerLicenseId: customerLicense.id,
			remainingChange: 0,
			paidQuantity,
		});

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
		customerLicenseUpdates,
		lineItems,
	};
};
