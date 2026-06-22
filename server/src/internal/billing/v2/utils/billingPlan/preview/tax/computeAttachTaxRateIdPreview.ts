import type {
	AutumnBillingPlan,
	BillingContext,
	LineItem,
	PreviewTax,
} from "@autumn/shared";
import {
	atmnToStripeAmount,
	orgToCurrency,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const lineItemToTaxableMinorUnits = ({
	lineItem,
	currency,
}: {
	lineItem: LineItem;
	currency: string;
}) => {
	const amount = lineItem.context.discountable
		? lineItem.amount
		: (lineItem.amountAfterDiscounts ?? lineItem.amount);

	let taxableMinorUnits = atmnToStripeAmount({ amount, currency });

	if (!lineItem.context.discountable || taxableMinorUnits <= 0) {
		return taxableMinorUnits;
	}

	for (const discount of lineItem.discounts ?? []) {
		const discountMinorUnits = discount.percentOff
			? new Decimal(taxableMinorUnits)
					.times(discount.percentOff)
					.div(100)
					.round()
					.toNumber()
			: atmnToStripeAmount({ amount: discount.amountOff, currency });

		taxableMinorUnits = Math.max(taxableMinorUnits - discountMinorUnits, 0);
	}

	return taxableMinorUnits;
};

const taxableMinorUnitsToTaxMinorUnits = ({
	taxableMinorUnits,
	percentage,
	inclusive,
}: {
	taxableMinorUnits: number;
	percentage: number;
	inclusive: boolean;
}) => {
	return inclusive
		? new Decimal(taxableMinorUnits)
				.times(percentage)
				.div(100 + percentage)
				.round()
				.toNumber()
		: new Decimal(taxableMinorUnits)
				.times(percentage)
				.div(100)
				.round()
				.toNumber();
};

export const computeAttachTaxRateIdPreview = async ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<PreviewTax | undefined> => {
	if (!billingContext.taxRateId) return undefined;

	const allLineItems = autumnBillingPlan.lineItems ?? [];
	if (allLineItems.length === 0) return undefined;

	const immediateLines = allLineItems.filter((line) => line.chargeImmediately);
	if (immediateLines.length === 0) return undefined;

	const currency = orgToCurrency({ org: ctx.org });
	const taxableMinorUnits = immediateLines.map((lineItem) =>
		lineItemToTaxableMinorUnits({ lineItem, currency }),
	);

	return computeTaxRateIdPreviewFromTaxableMinorUnits({
		ctx,
		billingContext,
		taxableMinorUnits,
	});
};

/** Core tax-rate-id math over pre-computed taxable amounts (minor units). */
export const computeTaxRateIdPreviewFromTaxableMinorUnits = ({
	ctx,
	billingContext,
	taxableMinorUnits,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	taxableMinorUnits: number[];
}): PreviewTax | undefined => {
	if (!billingContext.taxRateId) return undefined;

	const currency = orgToCurrency({ org: ctx.org });
	const totalTaxableMinorUnits = taxableMinorUnits.reduce(
		(sum, amount) => sum + amount,
		0,
	);

	if (totalTaxableMinorUnits === 0) {
		return {
			total: 0,
			amount_inclusive: 0,
			amount_exclusive: 0,
			currency,
			status: "complete",
		};
	}

	const taxRate = billingContext.stripeTaxRate;
	if (!taxRate) {
		ctx.logger.warn(
			`[computeAttachTaxRateIdPreview] stripeTaxRate missing on billing context for taxRateId=${billingContext.taxRateId}; returning incomplete`,
		);
		return {
			total: 0,
			amount_inclusive: 0,
			amount_exclusive: 0,
			currency,
			status: "incomplete",
		};
	}

	const taxMinorUnits = taxableMinorUnits.reduce(
		(sum, amount) =>
			sum +
			taxableMinorUnitsToTaxMinorUnits({
				taxableMinorUnits: amount,
				percentage: taxRate.percentage,
				inclusive: taxRate.inclusive,
			}),
		0,
	);

	const taxAmount = stripeToAtmnAmount({
		amount: taxMinorUnits,
		currency,
	});

	return {
		total: taxRate.inclusive ? 0 : taxAmount,
		amount_inclusive: taxRate.inclusive ? taxAmount : 0,
		amount_exclusive: taxRate.inclusive ? 0 : taxAmount,
		currency,
		status: "complete",
	};
};
