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

	const credits = catalogCredits.map((catalogCredit) => ({
		catalogCredit,
		storedCredit: storedInvoiceCreditForPrice({
			ctx,
			customerProduct,
			billingContext,
			target: {
				price: catalogCredit.context.price,
				product: licenseProduct,
			},
			consumedChargeRowIds,
		}),
	}));

	const resolvedCredits = credits.filter(
		({ storedCredit }) => storedCredit.resolved,
	);
	const storedSeats = resolvedCredits.reduce(
		(total, { storedCredit }) => total + storedCredit.coveredSeats,
		0,
	);
	const paidSeats = resolvedCredits.reduce(
		(total, { catalogCredit }) => total + (catalogCredit.paidQuantity ?? 0),
		0,
	);
	if (storedSeats < paidSeats) {
		ctx.logger.warn(
			`[licenseInvoiceCreditFromStoredLineItems] Stored rows cover ${storedSeats} of ${paidSeats} paid seats for cusProduct=${customerProduct.id}; falling back to catalog credit`,
		);
		return catalogCredits;
	}

	return credits.flatMap(({ catalogCredit, storedCredit }) =>
		storedCredit.resolved ? storedCredit.lineItems : [catalogCredit],
	);
};
