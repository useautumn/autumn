import type {
	BillingContext,
	FullCustomerLicense,
	StripeItemSpec,
} from "@autumn/shared";
import { customerLicenseToUnusedPrepaidRows } from "@/internal/billing/v2/utils/lineItems/customerLicenseToUnusedPrepaidRows";
import { resolveLicenseBillingRowsThroughDefinition } from "@/internal/billing/v2/utils/lineItems/resolveLicenseBillingRowsThroughDefinition";
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
	const planLicense = customerLicense.planLicense;
	if (!planLicense) return [];

	const seatRows = (
		billingContext.customerLicenseBillingContext?.licenseBillingPriceRows ?? []
	).filter((row) => row.source.customerLicenseId === customerLicense.id);
	const projectedPlanLicenseIds =
		billingContext.customerLicenseBillingContext?.projectedPlanLicenseIds ??
		new Set<string>();

	// Desired state prices seats through the pool's (possibly repointed)
	// definition — the read-time twin of the seat repoint executor.
	const licenseBillingRows = [
		...resolveLicenseBillingRowsThroughDefinition({
			licenseBillingRows: seatRows,
			planLicense,
			projectedPlanLicenseIds,
		}),
	];
	const billableAssignedQuantity = licenseBillingRows.reduce(
		(total, row) => total + row.quantity,
		0,
	);
	licenseBillingRows.push(
		...customerLicenseToUnusedPrepaidRows({
			customerLicense,
			billableAssignedQuantity,
		}),
	);

	return licenseBillingRows.map((licenseBillingRow) =>
		licenseBillingRowToStripeItemSpec({ licenseBillingRow }),
	);
};
