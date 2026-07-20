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

/** Builds one license pool's assigned and unused prepaid line items. */
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
	const projectedPlanLicenseIds =
		billingContext.customerLicenseBillingContext?.projectedPlanLicenseIds ??
		new Set<string>();

	// Seats bill through THIS side's definition: refunds get the outgoing
	// pool's terms, charges the incoming — mirroring the repoint executor.
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
