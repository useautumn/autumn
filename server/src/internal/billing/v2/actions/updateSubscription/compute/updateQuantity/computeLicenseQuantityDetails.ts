import type {
	CustomerLicenseUpdate,
	LineItem,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeCustomerLicenseQuantityChanges } from "@/internal/billing/v2/compute/computeCustomerLicenseQuantityChanges";
import { convergeCustomerLicense } from "@/internal/billing/v2/utils/convergeCustomerLicense";
import { customerLicenseToLineItems } from "@/internal/billing/v2/utils/lineItems/customerLicenseToLineItems";
import { licenseInvoiceCreditFromStoredLineItems } from "@/internal/billing/v2/utils/lineItems/licenseInvoiceCreditFromStoredLineItems";

export type LicenseQuantityDetails = {
	customerLicenseUpdates: CustomerLicenseUpdate[];
	lineItems: LineItem[];
};

/**
 * Converges pool paid counts onto the requested totals in place — the parent
 * customer product and seat anchors are untouched. Bills a refund of the full
 * previous quantity picture and a charge of the new one (one line per price,
 * like prepaid quantity updates); identical pairs cancel in finalizeLineItems.
 */
export const computeLicenseQuantityDetails = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
}): LicenseQuantityDetails => {
	const { customerProduct, customerLicenseQuantities } = billingContext;

	const changes = computeCustomerLicenseQuantityChanges({
		customerProduct,
		customerLicenseQuantities,
	});

	const lineItems = changes.flatMap(({ customerLicense, paidQuantity }) => [
		...licenseInvoiceCreditFromStoredLineItems({
			ctx,
			billingContext,
			customerProduct,
			customerLicense,
		}),
		...customerLicenseToLineItems({
			ctx,
			billingContext,
			customerProduct,
			customerLicense: convergeCustomerLicense({
				customerLicense,
				paidQuantity,
			}),
			direction: "charge",
		}),
	]);

	return {
		customerLicenseUpdates: changes.map(({ update }) => update),
		lineItems,
	};
};
