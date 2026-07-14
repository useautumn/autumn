import type {
	BillingContext,
	FullCustomerLicense,
	StripeItemSpec,
} from "@autumn/shared";
import { customerLicenseToUnusedPrepaidRows } from "@/internal/billing/v2/utils/lineItems/customerLicenseToUnusedPrepaidRows";
import { licenseBillingRowToStripeItemSpec } from "../stripeItemSpec/licenseBillingRowToStripeItemSpec";

/**
 * Desired Stripe items for one customer license: the context's seat rows
 * keyed to THIS row's id (persisted snapshots for continuing rows,
 * transitioned copies for planted successors) plus the unassigned buffer.
 * Seat + buffer specs sharing a price merge in the callers' accumulators.
 */
export const customerLicenseToStripeItemSpecs = ({
	billingContext,
	customerLicense,
}: {
	billingContext: BillingContext;
	customerLicense: FullCustomerLicense;
}): StripeItemSpec[] => {
	if (!customerLicense.planLicense) return [];

	const seatRows = (
		billingContext.customerLicenseBillingContext?.licenseBillingPriceRows ?? []
	).filter((row) => row.source.customerLicenseId === customerLicense.id);

	const licenseBillingRows = [
		...seatRows,
		...customerLicenseToUnusedPrepaidRows({ customerLicense }),
	];

	return licenseBillingRows.map((licenseBillingRow) =>
		licenseBillingRowToStripeItemSpec({ licenseBillingRow }),
	);
};
