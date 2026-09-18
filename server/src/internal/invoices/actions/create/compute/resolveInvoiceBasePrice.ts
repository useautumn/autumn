import {
	ErrCode,
	type FixedPriceConfig,
	type FullProduct,
	type InvoiceCustomize,
	type Price,
	PriceType,
	productToBasePrice,
	RecaseError,
} from "@autumn/shared";

type InvoiceBasePriceParams = NonNullable<InvoiceCustomize["price"]>;

export type ResolvedInvoiceBasePrice = { price: Price; amount: number };

/** In-memory fixed price for this invoice; never written to the catalog. */
export const buildInvoiceFixedPrice = ({
	template,
	params,
	productInternalId,
}: {
	template?: Price | null;
	params: InvoiceBasePriceParams;
	productInternalId: string;
}): Price => {
	const config: FixedPriceConfig = {
		type: PriceType.Fixed,
		amount: params.amount,
		interval: params.interval,
		interval_count: params.interval_count,
		stripe_price_id: params.processors?.stripe?.price_id,
		stripe_product_id:
			template?.config.type === PriceType.Fixed
				? template.config.stripe_product_id
				: undefined,
		feature_id: null,
		internal_feature_id: null,
	};
	return {
		id: template?.id ?? `invoice_base_${productInternalId}`,
		internal_product_id: productInternalId,
		org_id: template?.org_id,
		created_at: template?.created_at ?? Date.now(),
		billing_type: template?.billing_type ?? null,
		tier_behavior: null,
		is_custom: true,
		entitlement_id: null,
		proration_config: template?.proration_config ?? null,
		config,
	};
};

/**
 * The base price to bill for a plan on this invoice. `customize.price` null or
 * a zero amount omits the line entirely.
 */
export const resolveInvoiceBasePrice = ({
	product,
	customize,
}: {
	product: FullProduct;
	customize?: InvoiceCustomize;
}): ResolvedInvoiceBasePrice | undefined => {
	const catalogPrice = productToBasePrice({ product });

	if (customize?.price === null) return undefined;
	if (customize?.price === undefined) {
		if (!catalogPrice) return undefined;
		return { price: catalogPrice, amount: catalogPrice.config.amount };
	}

	if (customize.price.amount < 0) {
		throw new RecaseError({
			message: "customize.price.amount cannot be negative",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (customize.price.amount === 0) return undefined;

	return {
		price: buildInvoiceFixedPrice({
			template: catalogPrice,
			params: customize.price,
			productInternalId: product.internal_id,
		}),
		amount: customize.price.amount,
	};
};
