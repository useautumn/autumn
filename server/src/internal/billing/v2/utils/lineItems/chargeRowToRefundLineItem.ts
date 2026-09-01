import { generateKsuid } from "@autumn/ksuid";
import type { BillingContext } from "@autumn/shared";
import {
	billingContextToCurrency,
	cusPriceToCusEnt,
	customerProductToEntity,
	type DbInvoiceLineItem,
	type FullCusProduct,
	type FullProductWithoutLicenses,
	fixedPriceToDescription,
	type InvoiceLineItemDiscount,
	isFixedPrice,
	type LineItem,
	type LineItemContext,
	LineItemSchema,
	type Price,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * A stored charge row may carry Stripe's own wording, which renders a flat fee as
 * its subscription quantity and the product's `unit_label` ("1 emails × Plan").
 * Fixed prices are re-rendered in Autumn's format; usage prices keep the stored
 * text, which carries tier detail Autumn's description would drop.
 */
const refundLineDescription = ({
	chargeRow,
	price,
	product,
	context,
	preferStoredText,
}: {
	chargeRow: DbInvoiceLineItem;
	price: Price;
	product: { name: string };
	context: LineItemContext;
	/** License credits keep stored wording so the assigned quantity stays visible. */
	preferStoredText: boolean;
}): string => {
	if (!preferStoredText && isFixedPrice(price)) {
		return fixedPriceToDescription({
			price,
			currency: context.currency,
			context,
		});
	}

	if (chargeRow.description) return `Unused ${chargeRow.description}`;
	return `Unused ${product.name}`;
};

export const chargeRowToRefundLineItem = ({
	chargeRow,
	creditAmount,
	effectiveNow,
	customerProduct,
	billingContext,
	ctx,
	contextOverride,
}: {
	chargeRow: DbInvoiceLineItem;
	creditAmount: number;
	effectiveNow: number;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
	ctx: AutumnContext;
	contextOverride?: {
		price: Price;
		product: FullProductWithoutLicenses;
	};
}): LineItem => {
	const periodStart =
		chargeRow.effective_period_start ?? billingContext.currentEpochMs;
	const periodEnd =
		chargeRow.effective_period_end ?? billingContext.currentEpochMs;

	const entity = customerProductToEntity({
		customerProduct,
		entities: billingContext.fullCustomer.entities,
	});

	const matchingCusPrice = customerProduct.customer_prices.find(
		(cp) =>
			cp.price.id === chargeRow.price_id ||
			(chargeRow.stripe_price_id != null &&
				cp.price.config?.stripe_price_id === chargeRow.stripe_price_id),
	);
	const product = contextOverride?.product ?? customerProduct.product;
	const price =
		contextOverride?.price ??
		matchingCusPrice?.price ??
		customerProduct.customer_prices[0]?.price;

	const couponNameById = new Map(
		(billingContext.stripeDiscounts ?? []).map((discount) => [
			discount.source.coupon.id,
			discount.source.coupon.name ?? discount.source.coupon.id,
		]),
	);
	const matchingCusEnt = matchingCusPrice
		? cusPriceToCusEnt({
				cusPrice: matchingCusPrice,
				cusEnts: customerProduct.customer_entitlements,
			})
		: undefined;

	if (!price) {
		throw new Error(
			`[chargeRowToRefundLineItem] No price found on cusProduct ${customerProduct.id} for charge row ${chargeRow.id}`,
		);
	}

	const context: LineItemContext = {
		price,
		product,
		feature: matchingCusEnt?.entitlement.feature,
		currency: billingContextToCurrency({ org: ctx.org, billingContext }),
		billingPeriod: { start: periodStart, end: periodEnd },
		effectivePeriod: { start: effectiveNow, end: periodEnd },
		direction: "refund",
		now: effectiveNow,
		billingTiming: "in_advance",
		discountable: false,
		entity,
		customerProduct,
		customerPrice: matchingCusPrice,
		customerEntitlement: matchingCusEnt,
	};

	const description = refundLineDescription({
		chargeRow,
		price,
		product,
		context,
		preferStoredText: contextOverride !== undefined,
	});

	const lineItemData = {
		id: generateKsuid({ prefix: "invoice_li_" }),
		amount: creditAmount,
		amountAfterDiscounts: creditAmount,
		description,
		context,
		stripePriceId: chargeRow.stripe_price_id ?? undefined,
		stripeProductId: chargeRow.stripe_product_id ?? undefined,
		totalQuantity: chargeRow.total_quantity ?? undefined,
		paidQuantity: chargeRow.paid_quantity ?? undefined,
		chargeImmediately: chargeRow.invoice_id !== null,
		prorated: true,
		discounts:
			(chargeRow.discounts as InvoiceLineItemDiscount[] | null)?.map((d) => ({
				amountOff: d.amount_off,
				percentOff: d.percent_off,
				stripeCouponId: d.stripe_coupon_id,
				couponName: d.stripe_coupon_id
					? (couponNameById.get(d.stripe_coupon_id) ?? d.stripe_coupon_id)
					: undefined,
			})) ?? [],
		amountAfterDiscountsFinalized: true,
	};

	const result = LineItemSchema.safeParse(lineItemData);
	if (!result.success) {
		throw result.error;
	}

	return result.data;
};
