import type {
	BillingContext,
	FullCusProduct,
	FullCustomerLicense,
	LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerLicenseToUnusedPrepaidRows } from "./customerLicenseToUnusedPrepaidRows";
import { licenseBillingRowToLineItem } from "./licenseBillingRowToLineItem";

/**
 * Line items for one customer license: the context's seat rows keyed to THIS
 * row's id (persisted snapshots for outgoing rows, transitioned copies for
 * planted successors) plus the in-memory unassigned buffer.
 */
export const customerLicenseToLineItems = ({
	ctx,
	billingContext,
	customerProduct,
	customerLicense,
	direction,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	customerProduct: FullCusProduct;
	customerLicense: FullCustomerLicense;
	direction: "charge" | "refund";
}): LineItem[] => {
	const licenseProduct = customerLicense.planLicense?.product;
	if (!licenseProduct) return [];

	const seatRows = (
		billingContext.customerLicenseBillingContext?.licenseBillingPriceRows ?? []
	).filter((row) => row.source.customerLicenseId === customerLicense.id);

	const licenseBillingRows = [
		...seatRows,
		...customerLicenseToUnusedPrepaidRows({ customerLicense }),
	];

	return licenseBillingRows.map((licenseBillingRow) =>
		licenseBillingRowToLineItem({
			ctx,
			billingContext,
			licenseBillingRow,
			licenseProduct,
			customerProduct,
			direction,
		}),
	);
};
