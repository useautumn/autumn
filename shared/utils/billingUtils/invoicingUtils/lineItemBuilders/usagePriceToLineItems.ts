import { generateKsuid } from "@autumn/ksuid";
import { Decimal } from "decimal.js";
import type { LineItem } from "../../../../models/billingModels/lineItem/lineItem";
import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext";
import type { TierLineBand } from "../../../../models/billingModels/lineItem/tierLineBand";
import type { FullCusEntWithFullCusProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntsToAllowance } from "../../../cusEntUtils/balanceUtils/grantedBalanceUtils/cusEntsToAllowance";
import { atmnToStripeAmount } from "../../../productUtils/priceUtils/convertAmountUtils";
import { descriptionWithEntityLabel } from "../descriptionUtils/descriptionWithEntityLabel";
import { tierLineBandToDescription } from "../descriptionUtils/tierLineBandToDescription";
import { tierLineBandsToBilledAmounts } from "../lineItemUtils/tierLineBandsToBilledAmounts";
import { tiersToLineBands } from "../lineItemUtils/tiersToLineBands";
import { usagePriceToLineItem } from "./usagePriceToLineItem";

type UsagePriceLineItemOptions = Parameters<
	typeof usagePriceToLineItem
>[0]["options"];

const bandToUnitPricing = ({
	band,
	billingUnits,
}: {
	band: TierLineBand;
	billingUnits: number;
}): LineItem["unitPricing"] =>
	band.kind === "flat_fee"
		? { quantity: 1, unitAmount: band.unitAmount }
		: {
				quantity: new Decimal(band.quantity).div(billingUnits).toNumber(),
				unitAmount: band.unitAmount,
			};

// A lone usage band keeps the line's usage and overage; split bands report their own units.
const bandToReportedQuantities = ({
	band,
	lineItem,
	hasOneUsageBand,
}: {
	band: TierLineBand;
	lineItem: LineItem;
	hasOneUsageBand: boolean;
}): Pick<LineItem, "totalQuantity" | "paidQuantity"> => {
	if (band.kind === "flat_fee") {
		return { totalQuantity: undefined, paidQuantity: undefined };
	}
	if (hasOneUsageBand) {
		return {
			totalQuantity: lineItem.totalQuantity,
			paidQuantity: lineItem.paidQuantity,
		};
	}
	return { totalQuantity: band.quantity, paidQuantity: band.quantity };
};

const bandsSumToLineAmount = ({
	bands,
	lineItem,
}: {
	bands: TierLineBand[];
	lineItem: LineItem;
}): boolean => {
	const { currency } = lineItem.context;
	const bandsTotal = bands
		.reduce((sum, band) => sum.plus(band.amount), new Decimal(0))
		.toNumber();
	return (
		atmnToStripeAmount({ amount: bandsTotal, currency }) ===
		atmnToStripeAmount({ amount: lineItem.amount, currency })
	);
};

/**
 * Bills a usage price as one line per tier band (quantity × rate), plus a volume tier's flat fee.
 * Falls back to the single `usagePriceToLineItem` line for refunds, prorations and $0 lines.
 */
export const usagePriceToLineItems = ({
	cusEnt,
	context,
	options = {},
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	context: LineItemContext;
	options?: UsagePriceLineItemOptions;
}): LineItem[] => {
	const lineItem = usagePriceToLineItem({ cusEnt, context, options });

	const isPlainCharge =
		lineItem.context.direction === "charge" &&
		!lineItem.prorated &&
		lineItem.amount > 0;
	if (!isPlainCharge) return [lineItem];

	const { price, currency } = lineItem.context;
	const bands = tiersToLineBands({
		price,
		overage: lineItem.paidQuantity ?? 0,
		allowance: cusEntsToAllowance({ cusEnts: [cusEnt] }),
		currency,
	}).filter((band) => band.amount !== 0);

	// Anything that reshaped the amount after pricing (e.g. backdating) keeps the single line.
	if (!bandsSumToLineAmount({ bands, lineItem })) return [lineItem];

	const billedAmounts = tierLineBandsToBilledAmounts({
		bands,
		total: lineItem.amount,
		currency,
	});
	const billingUnits = price.config.billing_units ?? 1;
	const hasOneUsageBand =
		bands.filter((band) => band.kind === "usage").length === 1;

	const bandLineItems = bands
		.map((band, index) => {
			const amount = billedAmounts[index];
			return {
				...lineItem,
				id:
					index === 0 ? lineItem.id : generateKsuid({ prefix: "invoice_li_" }),
				amount,
				amountAfterDiscounts: amount,
				description: descriptionWithEntityLabel({
					description: tierLineBandToDescription({
						band,
						context: lineItem.context,
						includePeriodDescription: options.includePeriodDescription,
					}),
					context: lineItem.context,
				}),
				...bandToReportedQuantities({ band, lineItem, hasOneUsageBand }),
				unitPricing: bandToUnitPricing({ band, billingUnits }),
			} satisfies LineItem;
		})
		.filter((bandLineItem) => bandLineItem.amount !== 0);

	return bandLineItems.length > 0 ? bandLineItems : [lineItem];
};
