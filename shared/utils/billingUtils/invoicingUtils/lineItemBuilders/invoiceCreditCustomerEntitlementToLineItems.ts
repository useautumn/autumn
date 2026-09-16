import { Decimal } from "decimal.js";
import type { LineItem } from "../../../../models/billingModels/lineItem/lineItem.js";
import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext.js";
import type { FullCusEntWithFullCusProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type { Feature } from "../../../../models/featureModels/featureModels.js";
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
	amount: number;
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
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
	features: Feature[];
	currency: string;
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
			return {
				attributionKey,
				feature,
				label: dimensionName ? `${sourceName} — ${dimensionName}` : sourceName,
				units: sourceAttribution.units,
				credits: sourceAttribution.credits,
				amount: roundToCurrency({
					amount: sourceAttribution.credits,
					currency,
				}),
			};
		});

const smallestBillableUnit = (currency: string): Decimal =>
	STRIPE_THREE_DECIMAL_CURRENCIES.has(currency.toLowerCase())
		? new Decimal(0.01)
		: new Decimal(1).div(stripeMinorUnitFactor(currency));

const roundingResidual = (line: CreditSourceLine): Decimal =>
	new Decimal(line.amount).sub(line.credits);

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
	const sourceLines = customerEntitlementToCreditSourceLines({
		customerEntitlement,
		features,
		currency: context.currency,
	});

	const overage = cusEntToInvoiceOverage({ cusEnt: customerEntitlement });
	const creditsApplied = fullyOffsetOverage
		? sumCredits(sourceLines)
		: Decimal.max(sumCredits(sourceLines).sub(overage), 0);

	const roundedCreditsApplied = creditsApplied.isZero()
		? 0
		: roundToCurrency({
				amount: creditsApplied.toNumber(),
				currency: context.currency,
			});
	const roundedOverage = fullyOffsetOverage
		? 0
		: roundToCurrency({ amount: overage, currency: context.currency });

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
