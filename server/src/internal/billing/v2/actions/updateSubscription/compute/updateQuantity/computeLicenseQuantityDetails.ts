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
