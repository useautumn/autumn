import { Decimal } from "decimal.js";
import type { LineItem } from "../../../../models/billingModels/lineItem/lineItem.js";
import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext.js";
import type { FullCusEntWithFullCusProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type { Feature } from "../../../../models/featureModels/featureModels.js";
import { cusEntToInvoiceOverage } from "../../../cusEntUtils/overageUtils/cusEntToInvoiceOverage.js";
import { findFeatureByInternalId } from "../../../featureUtils/findFeatureUtils.js";
import { buildLineItem } from "./buildLineItem.js";

const creditQuantityFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 12,
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
	const attribution = Object.entries(
		customerEntitlement.usage_attribution ?? {},
	)
		.filter(([, value]) => value.credits > 0)
		.sort(([firstInternalId], [secondInternalId]) =>
			firstInternalId.localeCompare(secondInternalId),
		);

	let totalCredits = new Decimal(0);
	for (const [sourceInternalFeatureId, sourceAttribution] of attribution) {
		const sourceFeature = findFeatureByInternalId({
			features,
			internalId: sourceInternalFeatureId,
			errorOnNotFound: true,
		});
		totalCredits = totalCredits.add(sourceAttribution.credits);
		const sourceLineItem = buildLineItem({
			context: {
				...context,
				feature: sourceFeature,
				direction: "charge",
			},
			amount: sourceAttribution.credits,
			description: `${sourceFeature.name}, ${creditQuantityFormatter.format(sourceAttribution.units)} units`,
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

	const invoiceCreditFeature = customerEntitlement.entitlement.feature;
	const overage = cusEntToInvoiceOverage({ cusEnt: customerEntitlement });
	const creditsApplied = fullyOffsetOverage
		? totalCredits
		: Decimal.max(totalCredits.sub(overage), 0);
	if (creditsApplied.isZero()) return lineItems;

	const offsetLineItem = buildLineItem({
		context: {
			...context,
			feature: invoiceCreditFeature,
			direction: "refund",
		},
		amount: creditsApplied.toNumber(),
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
