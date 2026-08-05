import type {
	BillingContext,
	FullCusProduct,
	FullCustomerLicense,
	LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerLicenseToLineItems } from "./customerLicenseToLineItems";
import { storedInvoiceCreditForPrice } from "./storedInvoiceCreditForPrice";

export const licenseInvoiceCreditFromStoredLineItems = ({
	ctx,
	billingContext,
	customerProduct,
	customerLicense,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	customerProduct: FullCusProduct;
	customerLicense: FullCustomerLicense;
}): LineItem[] => {
	const licenseProduct = customerLicense.planLicense?.product;
	if (!licenseProduct) return [];

	const catalogCredits = customerLicenseToLineItems({
		ctx,
		billingContext,
		customerProduct,
		customerLicense,
		direction: "refund",
	});

	// Assignments can hold distinct price rows that resolve to the same stored
	// charge, so each charge row may only be credited once.
	const consumedChargeRowIds = new Set<string>();

	return catalogCredits.flatMap((catalogCredit) => {
		const storedCredit = storedInvoiceCreditForPrice({
			ctx,
			customerProduct,
			billingContext,
			target: {
				price: catalogCredit.context.price,
				product: licenseProduct,
			},
			consumedChargeRowIds,
		});

		return storedCredit.resolved ? storedCredit.lineItems : [catalogCredit];
	});
};
