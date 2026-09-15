import { Decimal } from "decimal.js";
import type { LineItem } from "../../../../models/billingModels/lineItem/lineItem.js";
import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext.js";
import type { FullCusEntWithFullCusProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type { Feature } from "../../../../models/featureModels/featureModels.js";
import { priceAmountsForCurrency } from "../../../../models/productModels/priceModels/priceConfig/priceCurrencyView.js";
import type { Price } from "../../../../models/productModels/priceModels/priceModels.js";
import {
	STRIPE_THREE_DECIMAL_CURRENCIES,
	stripeMinorUnitFactor,
} from "../../../currencyUtils/stripeCurrencies.js";
import { cusEntToInvoiceOverage } from "../../../cusEntUtils/overageUtils/cusEntToInvoiceOverage.js";
import { parseUsageAttributionKey } from "../../../cusEntUtils/usageAttribution/parseUsageAttributionKey.js";
import { findFeatureByInternalId } from "../../../featureUtils/findFeatureUtils.js";
import {
	atmnToStripeAmount,
	stripeToAtmnAmount,
} from "../../../productUtils/priceUtils/convertAmountUtils.js";
import { buildLineItem } from "./buildLineItem.js";

const creditQuantityFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 12,
});

type CreditSourceLine = {
	attributionKey: string;
	feature?: Feature;
	label: string;
	units: number;
	credits: number;
	exactAmount: Decimal;
	amount: number;
};

/** Flat rate per credit in the invoice currency: the single tier's amount spread over its billing units. */
const creditRateForCurrency = ({
	price,
	currency,
}: {
	price: Price;
	currency: string;
}): Decimal => {
	const tiers =
		priceAmountsForCurrency({ config: price.config, currency }).usage_tiers ??
		price.config.usage_tiers ??
		[];
	const amount = tiers[0]?.amount ?? 0;
	return new Decimal(amount).div(price.config.billing_units || 1);
};

const roundToCurrency = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}): number =>
	stripeToAtmnAmount({
		amount: atmnToStripeAmount({ amount, currency }),
		currency,
	});

const withStableInvoiceCreditId = ({
	lineItem,
	idempotencyScope,
	position,
}: {
	lineItem: LineItem;
	idempotencyScope?: string;
	position: string;
}): LineItem =>
	idempotencyScope
		? {
				...lineItem,
				amountAfterDiscountsFinalized: true,
				id: `invoice_li_credit_${idempotencyScope}_${position}`,
			}
		: { ...lineItem, amountAfterDiscountsFinalized: true };

const sumAmounts = (lines: CreditSourceLine[]): Decimal =>
	lines.reduce((sum, line) => sum.add(line.amount), new Decimal(0));

const sumCredits = (lines: CreditSourceLine[]): Decimal =>
	lines.reduce((sum, line) => sum.add(line.credits), new Decimal(0));

const customerEntitlementToCreditSourceLines = ({
	customerEntitlement,
	features,
	currency,
	rate,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
	features: Feature[];
	currency: string;
	rate: Decimal;
}): CreditSourceLine[] =>
	Object.entries(customerEntitlement.usage_attribution ?? {})
		.filter(([, value]) => value.credits > 0)
		.sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
		.map(([attributionKey, sourceAttribution]) => {
			const { internalFeatureId, dimensionName } = parseUsageAttributionKey({
				key: attributionKey,
			});
			const feature = findFeatureByInternalId({
				features,
				internalId: internalFeatureId,
				errorOnNotFound: false,
			});
			const sourceName = feature?.name ?? "Removed feature";
			const exactAmount = rate.mul(sourceAttribution.credits);
			return {
				attributionKey,
				feature,
				label: dimensionName ? `${sourceName} — ${dimensionName}` : sourceName,
				units: sourceAttribution.units,
				credits: sourceAttribution.credits,
				exactAmount,
				amount: roundToCurrency({ amount: exactAmount.toNumber(), currency }),
			};
		});

const smallestBillableUnit = (currency: string): Decimal =>
	STRIPE_THREE_DECIMAL_CURRENCIES.has(currency.toLowerCase())
		? new Decimal(0.01)
		: new Decimal(1).div(stripeMinorUnitFactor(currency));

const roundingResidual = (line: CreditSourceLine): Decimal =>
	new Decimal(line.amount).sub(line.exactAmount);

/**
 * Rounding each source line to the cent can drift their sum away from the rounded
 * target. The lines rounded furthest give back one unit each, so none goes negative.
 */
const absorbRoundingDrift = ({
	lines,
	targetTotal,
	currency,
}: {
	lines: CreditSourceLine[];
	targetTotal: Decimal;
	currency: string;
}): void => {
	let drift = sumAmounts(lines).sub(targetTotal);
	if (drift.isZero()) return;

	const step = smallestBillableUnit(currency).mul(drift.isNegative() ? 1 : -1);
	const furthestRoundedFirst = [...lines].sort((first, second) =>
		step.isNegative()
			? roundingResidual(second).cmp(roundingResidual(first))
			: roundingResidual(first).cmp(roundingResidual(second)),
	);

	for (const line of furthestRoundedFirst) {
		if (drift.isZero()) return;
		line.amount = roundToCurrency({
			amount: new Decimal(line.amount).add(step).toNumber(),
			currency,
		});
		drift = drift.add(step);
	}
};

export const invoiceCreditCustomerEntitlementToLineItems = ({
	customerEntitlement,
	context,
	features,
	idempotencyScope,
	fullyOffsetOverage = false,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
	context: LineItemContext;
	features: Feature[];
	idempotencyScope?: string;
	fullyOffsetOverage?: boolean;
}): LineItem[] => {
	const invoiceCreditFeature = customerEntitlement.entitlement.feature;
	const rate = creditRateForCurrency({
		price: context.price,
		currency: context.currency,
	});
	const sourceLines = customerEntitlementToCreditSourceLines({
		customerEntitlement,
		features,
		currency: context.currency,
		rate,
	});

	const overage = cusEntToInvoiceOverage({ cusEnt: customerEntitlement });
	const creditsApplied = fullyOffsetOverage
		? sumCredits(sourceLines)
		: Decimal.max(sumCredits(sourceLines).sub(overage), 0);

	const roundedCreditsApplied = creditsApplied.isZero()
		? 0
		: roundToCurrency({
				amount: rate.mul(creditsApplied).toNumber(),
				currency: context.currency,
			});
	const roundedOverage = fullyOffsetOverage
		? 0
		: roundToCurrency({
				amount: rate.mul(overage).toNumber(),
				currency: context.currency,
			});

	absorbRoundingDrift({
		lines: sourceLines,
		targetTotal: new Decimal(roundedOverage).add(roundedCreditsApplied),
		currency: context.currency,
	});

	const lineItems = sourceLines.map((line) =>
		withStableInvoiceCreditId({
			lineItem: buildLineItem({
				context: {
					...context,
					feature: line.feature ?? invoiceCreditFeature,
					direction: "charge",
				},
				amount: line.amount,
				description: `${line.label}, ${creditQuantityFormatter.format(line.units)} units`,
				shouldProrate: false,
				usage: line.units,
			}),
			idempotencyScope,
			position: `${customerEntitlement.id}_${line.attributionKey}`,
		}),
	);

	if (creditsApplied.isZero()) return lineItems;

	const offsetLineItem = buildLineItem({
		context: {
			...context,
			feature: invoiceCreditFeature,
			direction: "refund",
		},
		amount: roundedCreditsApplied,
		description: "Credits applied",
		shouldProrate: false,
	});
	lineItems.push(
		withStableInvoiceCreditId({
			lineItem: offsetLineItem,
			idempotencyScope,
			position: `${customerEntitlement.id}_applied`,
		}),
	);

	return lineItems;
};
