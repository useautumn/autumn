import {
	atmnToStripeAmount,
	type CreateInvoicePreview,
	type CreateInvoicePreviewLine,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { lineItemToMetadata } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemToMetadata";
import { lineItemToStripeProductId } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemToStripeProductId";
import { applyInvoiceCredits } from "@/internal/billing/v2/utils/billingPlan/preview/invoiceCredits/applyInvoiceCredits";
import type { InvoiceLine } from "../compute/computeInvoiceLines";
import { computeInvoiceTaxPreview } from "../compute/computeInvoiceTaxPreview";
import type { CreateInvoiceContext } from "../setup/setupCreateInvoiceContext";
import { assignInvoiceDiscounts } from "./assignInvoiceDiscounts";

export type StripeInvoicePlan = {
	lines: Stripe.InvoiceAddLinesParams.Line[];
	invoiceCouponIds: string[];
	preview: CreateInvoicePreview;
};

const percentOffTotal = ({
	amount,
	coupons,
	currency,
}: {
	amount: number;
	coupons: Stripe.Coupon[];
	currency: string;
}) =>
	coupons.reduce((remaining, coupon) => {
		if (coupon.percent_off) {
			return remaining.minus(remaining.mul(coupon.percent_off).div(100));
		}
		if (coupon.amount_off) {
			return Decimal.max(
				remaining.minus(
					stripeToAtmnAmount({ amount: coupon.amount_off, currency }),
				),
				0,
			);
		}
		return remaining;
	}, new Decimal(amount));

/** Maps computed lines onto Stripe add-lines params and the preview totals. */
export const evaluateStripeInvoicePlan = ({
	invoiceContext,
	lines,
	issueDateMs,
	dueDateMs,
}: {
	invoiceContext: CreateInvoiceContext;
	lines: InvoiceLine[];
	issueDateMs: number;
	dueDateMs: number | null;
}): StripeInvoicePlan => {
	const { currency } = invoiceContext;

	const planDiscounts = Object.fromEntries(
		invoiceContext.plans
			.filter((plan) => plan.discounts.length > 0)
			.map((plan) => [plan.planKey, plan.discounts]),
	);
	const assigned = assignInvoiceDiscounts({
		lines: lines
			.filter((line) => line.planKey)
			.map((line) => ({
				lineId: line.lineItem.id,
				planKey: line.planKey as string,
			})),
		invoiceDiscounts: invoiceContext.invoiceDiscounts,
		planDiscounts,
	});

	const couponsById = new Map(
		[
			...invoiceContext.invoiceDiscounts,
			...invoiceContext.plans.flatMap((plan) => plan.discounts),
		].map((discount) => [discount.source.coupon.id, discount.source.coupon]),
	);

	const stripeLines: Stripe.InvoiceAddLinesParams.Line[] = [];
	const previewLines: CreateInvoicePreviewLine[] = [];

	for (const line of lines) {
		const { lineItem } = line;
		const lineCoupons = (assigned.lineCouponIds[lineItem.id] ?? [])
			.map((id) => couponsById.get(id))
			.filter((coupon): coupon is Stripe.Coupon => Boolean(coupon));
		const amountAfterLineDiscounts = percentOffTotal({
			amount: lineItem.amount,
			coupons: lineCoupons,
			currency,
		});

		const stripeProductId = lineItemToStripeProductId({ lineItem });
		const minorAmount = atmnToStripeAmount({
			amount: lineItem.amount,
			currency,
		});
		stripeLines.push({
			description: lineItem.description,
			// A named Stripe price bills through Stripe's own tiers; otherwise the
			// amount Autumn computed is billed inline.
			...(line.stripePriceId
				? {
						pricing: { price: line.stripePriceId },
						quantity: line.stripeQuantity ?? 1,
					}
				: stripeProductId && minorAmount > 0
					? {
							price_data: {
								unit_amount: minorAmount,
								currency,
								product: stripeProductId,
							},
						}
					: { amount: minorAmount }),
			// Invoice-level coupons only reach discountable lines; the invoice's explicit
			// discounts array keeps customer-level coupons out.
			discountable: true,
			discounts: lineCoupons.map((coupon) => ({ coupon: coupon.id })),
			period: lineItem.context.effectivePeriod
				? {
						start: Math.floor(lineItem.context.effectivePeriod.start / 1000),
						end: Math.floor(lineItem.context.effectivePeriod.end / 1000),
					}
				: undefined,
			metadata: lineItemToMetadata({ lineItem }),
		});

		previewLines.push({
			plan_id: line.planId,
			feature_id: line.featureId,
			description: lineItem.description,
			amount: lineItem.amount,
			amount_after_discounts: amountAfterLineDiscounts.toDP(2).toNumber(),
			quantity: line.quantity,
			prorated: lineItem.prorated,
			period_start: lineItem.context.effectivePeriod?.start ?? null,
			period_end: lineItem.context.effectivePeriod?.end ?? null,
		});
	}

	const subtotal = previewLines.reduce(
		(sum, line) => sum.plus(line.amount),
		new Decimal(0),
	);
	const afterLineDiscounts = previewLines.reduce(
		(sum, line) => sum.plus(line.amount_after_discounts),
		new Decimal(0),
	);
	const afterInvoiceDiscounts = percentOffTotal({
		amount: afterLineDiscounts.toNumber(),
		coupons: assigned.invoiceCouponIds
			.map((id) => couponsById.get(id))
			.filter((coupon): coupon is Stripe.Coupon => Boolean(coupon)),
		currency,
	});

	// Stripe rounds tax per line, so the preview must tax each line's discounted
	// share rather than the invoice total.
	const invoiceDiscountRatio = afterLineDiscounts.isZero()
		? new Decimal(0)
		: afterInvoiceDiscounts.div(afterLineDiscounts);
	const tax = computeInvoiceTaxPreview({
		taxableAmounts: previewLines.map((line) =>
			new Decimal(line.amount_after_discounts)
				.mul(invoiceDiscountRatio)
				.toNumber(),
		),
		currency,
		taxRate: invoiceContext.taxRate,
	});

	const total = afterInvoiceDiscounts
		.plus(tax?.total ?? 0)
		.toDP(2)
		.toNumber();
	const { credits, amountDue } = applyInvoiceCredits({
		total,
		credits: invoiceContext.invoiceCredits,
	});

	return {
		lines: stripeLines,
		invoiceCouponIds: assigned.invoiceCouponIds,
		preview: {
			currency,
			lines: previewLines,
			subtotal: subtotal.toDP(2).toNumber(),
			discount_total: subtotal.minus(afterInvoiceDiscounts).toDP(2).toNumber(),
			tax: tax
				? {
						total: tax.total,
						amount_inclusive: tax.amount_inclusive,
						amount_exclusive: tax.amount_exclusive,
						status: tax.status,
					}
				: null,
			total,
			invoice_credits: credits,
			amount_due: amountDue,
			issue_date: issueDateMs,
			due_date: dueDateMs,
		},
	};
};
