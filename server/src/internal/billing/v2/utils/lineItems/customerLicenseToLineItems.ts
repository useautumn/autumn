import type {
	BillingContext,
	FullCusProduct,
	FullCustomerLicense,
	LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerLicenseToUnusedPrepaidRows } from "./customerLicenseToUnusedPrepaidRows";
import { licenseBillingRowToLineItem } from "./licenseBillingRowToLineItem";
import { resolveLicenseBillingRowsThroughDefinition } from "./resolveLicenseBillingRowsThroughDefinition";

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
	const planLicense = customerLicense.planLicense;
	const licenseProduct = planLicense?.product;
	if (!planLicense || !licenseProduct) return [];

	const seatRows = (
		billingContext.customerLicenseBillingContext?.licenseBillingPriceRows ?? []
	).filter((row) => row.source.customerLicenseId === customerLicense.id);

	// Seats bill through THIS side's definition: refunds get the outgoing
	// pool's terms, charges the incoming — mirroring the repoint executor.
	const licenseBillingRows = [
		...resolveLicenseBillingRowsThroughDefinition({
			licenseBillingRows: seatRows,
			planLicense,
		}),
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
