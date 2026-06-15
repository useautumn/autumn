import { generateKsuid } from "@autumn/ksuid";
import type { BillingContext } from "@autumn/shared";
import {
	customerProductToEntity,
	cusPriceToCusEnt,
	type DbInvoiceLineItem,
	type FullCusProduct,
	type InvoiceLineItemDiscount,
	type LineItem,
	type LineItemContext,
	LineItemSchema,
	orgToCurrency,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const chargeRowToRefundLineItem = ({
	chargeRow,
	creditAmount,
	effectiveNow,
	customerProduct,
	billingContext,
	ctx,
}: {
	chargeRow: DbInvoiceLineItem;
	creditAmount: number;
	effectiveNow: number;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
	ctx: AutumnContext;
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

	const couponNameById = new Map(
		(billingContext.stripeDiscounts ?? []).map((discount) => [
			discount.source.coupon.id,
			discount.source.coupon.name ?? discount.source.coupon.id,
		]),
	);
	const price =
		matchingCusPrice?.price ?? customerProduct.customer_prices[0]?.price;
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
		product: customerProduct.product,
		feature: matchingCusEnt?.entitlement.feature,
		currency: orgToCurrency({ org: ctx.org }),
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

	const description = chargeRow.description
		? `Unused ${chargeRow.description}`
		: `Unused ${customerProduct.product.name}`;

	const lineItemData = {
		id: generateKsuid({ prefix: "invoice_li_" }),
		amount: creditAmount,
		amountAfterDiscounts: creditAmount,
		description,
		context,
		stripePriceId: chargeRow.stripe_price_id ?? undefined,
		stripeProductId: chargeRow.stripe_product_id ?? undefined,
		chargeImmediately: chargeRow.invoice_id === null ? false : true,
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
	};

	const result = LineItemSchema.safeParse(lineItemData);
	if (!result.success) {
		throw result.error;
	}

	return result.data;
};
