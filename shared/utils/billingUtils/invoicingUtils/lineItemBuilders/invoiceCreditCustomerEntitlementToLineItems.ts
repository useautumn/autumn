import { Decimal } from "decimal.js";
import type { LineItem } from "../../../../models/billingModels/lineItem/lineItem.js";
import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext.js";
import type { FullCusEntWithFullCusProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type { Feature } from "../../../../models/featureModels/featureModels.js";
import { cusEntToInvoiceOverage } from "../../../cusEntUtils/overageUtils/cusEntToInvoiceOverage.js";
import { findFeatureByInternalId } from "../../../featureUtils/findFeatureUtils.js";
import {
	atmnToStripeAmount,
	stripeToAtmnAmount,
} from "../../../productUtils/priceUtils/convertAmountUtils.js";
import { buildLineItem } from "./buildLineItem.js";

const creditQuantityFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 12,
});

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
	const lineItems: LineItem[] = [];
	const invoiceCreditFeature = customerEntitlement.entitlement.feature;
	const attribution = Object.entries(
		customerEntitlement.usage_attribution ?? {},
	)
		.filter(([, value]) => value.credits > 0)
		.sort(([firstInternalId], [secondInternalId]) =>
			firstInternalId.localeCompare(secondInternalId),
		);

	let totalCredits = new Decimal(0);
	let totalRoundedCredits = new Decimal(0);
	for (const [sourceInternalFeatureId, sourceAttribution] of attribution) {
		const sourceFeature = findFeatureByInternalId({
			features,
			internalId: sourceInternalFeatureId,
			errorOnNotFound: false,
		});
		totalCredits = totalCredits.add(sourceAttribution.credits);
		const roundedCredits = roundToCurrency({
			amount: sourceAttribution.credits,
			currency: context.currency,
		});
		totalRoundedCredits = totalRoundedCredits.add(roundedCredits);
		const sourceLineItem = buildLineItem({
			context: {
				...context,
				feature: sourceFeature ?? invoiceCreditFeature,
				direction: "charge",
			},
			amount: roundedCredits,
			description: `${sourceFeature?.name ?? "Removed feature"}, ${creditQuantityFormatter.format(sourceAttribution.units)} units`,
			shouldProrate: false,
			usage: sourceAttribution.units,
		});
		lineItems.push(
			withStableInvoiceCreditId({
				lineItem: sourceLineItem,
				idempotencyScope,
				position: `${customerEntitlement.id}_${sourceInternalFeatureId}`,
			}),
		);
	}

	const overage = cusEntToInvoiceOverage({ cusEnt: customerEntitlement });
	const roundedOverage = roundToCurrency({
		amount: overage,
		currency: context.currency,
	});
	const creditsApplied = fullyOffsetOverage
		? totalCredits
		: Decimal.max(totalCredits.sub(overage), 0);
	if (creditsApplied.isZero()) return lineItems;
	const roundedCreditsApplied = fullyOffsetOverage
		? totalRoundedCredits.toNumber()
		: Decimal.max(totalRoundedCredits.sub(roundedOverage), 0).toNumber();

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
