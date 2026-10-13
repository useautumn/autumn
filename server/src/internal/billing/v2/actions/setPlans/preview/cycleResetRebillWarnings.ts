import {
	boldText,
	type FullCusProduct,
	type LineItem,
	type ProrationBehaviorOverride,
	plainText,
	punctuationText,
	type SetPlansPreviewWarning,
	type SetPlansTextPart,
} from "@autumn/shared";
import { warningText } from "./warningText";

const planKey = ({
	productId,
	internalEntityId,
}: {
	productId: string;
	internalEntityId?: string | null;
}) => `${productId}:${internalEntityId ?? ""}`;

const chargedPlanLabel = (lineItem: LineItem) => {
	const { product, entity } = lineItem.context;
	return entity
		? `${product.name} (${entity.name ?? entity.id})`
		: product.name;
};

/** "A", "A and B", "A, B and C", with each label bold. */
const listedLabels = (labels: string[]): SetPlansTextPart[] =>
	labels.flatMap((label, index) => {
		if (index === 0) return [boldText(label)];
		const isLast = index === labels.length - 1;
		return isLast
			? [plainText("and"), boldText(label)]
			: [punctuationText(","), boldText(label)];
	});

/**
 * A reset-now restarts every item on the subscription, as Stripe does, so plans the request
 * didn't change (other entities', kept or retained plans) are re-billed too.
 */
export const cycleResetRebillWarnings = ({
	resetsCycleNow,
	prorationOverride,
	lineItems,
	liveCustomerProducts,
}: {
	resetsCycleNow: boolean;
	/** Ending a trial with the reset bills the full period instead of prorating it. */
	prorationOverride?: ProrationBehaviorOverride;
	/** The line items the immediate invoice bills. */
	lineItems: LineItem[];
	/** Plans live on the subscription before the request. */
	liveCustomerProducts: FullCusProduct[];
}): Omit<SetPlansPreviewWarning, "severity">[] => {
	if (!resetsCycleNow) return [];

	const livePlanKeys = new Set(
		liveCustomerProducts.map((customerProduct) =>
			planKey({
				productId: customerProduct.product.id,
				internalEntityId: customerProduct.internal_entity_id,
			}),
		),
	);
	const rebilledLabels = [
		...new Set(
			lineItems
				.filter(
					({ context }) =>
						context.direction === "charge" &&
						context.billingTiming === "in_advance" &&
						livePlanKeys.has(
							planKey({
								productId: context.product.id,
								internalEntityId: context.entity?.internal_id,
							}),
						),
				)
				.map(chargedPlanLabel),
		),
	];
	if (rebilledLabels.length === 0) return [];

	const billsFullPeriod = prorationOverride === "bills_full_period";
	return [
		{
			type: "cycle_reset_rebills_plans",
			...warningText(
				billsFullPeriod
					? [
							plainText("The trial ends now, so"),
							...listedLabels(rebilledLabels),
							plainText(
								`${rebilledLabels.length === 1 ? "is" : "are"} billed for the full period now.`,
							),
						]
					: [
							plainText("Resetting the billing cycle also re-bills"),
							...listedLabels(rebilledLabels),
							punctuationText(", prorated, as Stripe does."),
						],
			),
		},
	];
};
