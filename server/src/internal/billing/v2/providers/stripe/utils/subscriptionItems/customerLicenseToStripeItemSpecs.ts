import type {
	BillingContext,
	FullCustomerLicense,
	StripeItemSpec,
} from "@autumn/shared";
import { customerLicenseToUnusedPrepaidRows } from "@/internal/billing/v2/utils/lineItems/customerLicenseToUnusedPrepaidRows";
import { resolveLicenseBillingRowsThroughDefinition } from "@/internal/billing/v2/utils/lineItems/resolveLicenseBillingRowsThroughDefinition";
import { licenseBillingRowToStripeItemSpec } from "../stripeItemSpec/licenseBillingRowToStripeItemSpec";

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
		billingContext.customerLicenseBillingContext?.projectedPlanLicenseIds ?? [];

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
