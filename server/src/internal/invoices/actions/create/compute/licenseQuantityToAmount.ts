import {
	ErrCode,
	type FullProduct,
	type InvoiceLicenseQuantity,
	type Price,
	productToBasePrice,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { buildInvoiceFixedPrice } from "./resolveInvoiceBasePrice";

export type ResolvedInvoiceLicense = {
	price: Price;
	amount: number;
	licenseProduct: FullProduct;
};

/**
 * Seat charge for a license linked to `parent`. `quantity` is billable seats;
 * the link's included seats are not subtracted.
 */
export const licenseQuantityToAmount = ({
	parent,
	licensePlanId,
	quantity,
	customize,
}: {
	parent: FullProduct;
	licensePlanId: string;
	quantity: number;
	customize?: InvoiceLicenseQuantity["customize"];
}): ResolvedInvoiceLicense => {
	const link = (parent.licenses ?? []).find(
		(candidate) => candidate.product.id === licensePlanId,
	);
	if (!link) {
		throw new RecaseError({
			message: `License ${licensePlanId} is not linked to plan ${parent.id}`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const licenseProduct = link.product as FullProduct;
	const catalogPrice = productToBasePrice({ product: licenseProduct });

	const noCharge = { price: catalogPrice as Price, amount: 0, licenseProduct };
	if (quantity <= 0 || customize?.price === null) return noCharge;

	const price =
		customize?.price === undefined
			? catalogPrice
			: buildInvoiceFixedPrice({
					template: catalogPrice,
					params: customize.price,
					productInternalId: licenseProduct.internal_id,
				});
	if (!price) {
		throw new RecaseError({
			message: `License ${licensePlanId} has no seat price`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const perSeat =
		customize?.price === undefined
			? (catalogPrice?.config.amount ?? 0)
			: customize.price.amount;

	return {
		price,
		amount: new Decimal(perSeat).mul(quantity).toDP(2).toNumber(),
		licenseProduct,
	};
};
