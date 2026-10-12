import { generateKsuid } from "@autumn/ksuid";
import { Decimal } from "decimal.js";
import type { LineItem } from "../../../../models/billingModels/lineItem/lineItem";
import type { LineItemContext } from "../../../../models/billingModels/lineItem/lineItemContext";
import type { FullCusEntWithFullCusProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntsToAllowance } from "../../../cusEntUtils/balanceUtils/grantedBalanceUtils/cusEntsToAllowance";
import { descriptionWithEntityLabel } from "../descriptionUtils/descriptionWithEntityLabel";
import { tierLineBandToDescription } from "../descriptionUtils/tierLineBandToDescription";
import { tierLineBandsToBilledAmounts } from "../lineItemUtils/tierLineBandsToBilledAmounts";
import { tiersToLineBands } from "../lineItemUtils/tiersToLineBands";
import { usagePriceToLineItem } from "./usagePriceToLineItem";

type UsagePriceLineItemOptions = Parameters<
	typeof usagePriceToLineItem
>[0]["options"];

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

	// The single gate for per-band lines: refunds, prorations and $0 lines stay one line.
	const billsPerBand =
		lineItem.context.direction === "charge" &&
		!lineItem.prorated &&
		lineItem.amount > 0;
	if (!billsPerBand) return [lineItem];

	const { price, currency } = lineItem.context;
	const bands = tiersToLineBands({
		price,
		overage: lineItem.paidQuantity ?? 0,
		allowance: cusEntsToAllowance({ cusEnts: [cusEnt] }),
		currency,
	}).filter((band) => band.amount !== 0);

	const billedAmounts = tierLineBandsToBilledAmounts({
		bands,
		total: lineItem.amount,
		currency,
	});
	// Rounding drift can push the last band below zero; a charge never becomes a credit line.
	const hasNegativeBand = billedAmounts.some((amount) => amount < 0);
	if (hasNegativeBand) return [lineItem];

	const billingUnits = price.config.billing_units ?? 1;
	const hasOneUsageBand =
		bands.filter((band) => band.kind === "usage").length === 1;

	const bandLineItems = bands
		.map((band, index): LineItem => {
			const amount = billedAmounts[index];
			const isFlatFee = band.kind === "flat_fee";
			// A lone usage band keeps the line's usage and overage; split bands report their own units.
			const reportedQuantity = hasOneUsageBand ? undefined : band.quantity;
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
				totalQuantity: isFlatFee
					? undefined
					: (reportedQuantity ?? lineItem.totalQuantity),
				paidQuantity: isFlatFee
					? undefined
					: (reportedQuantity ?? lineItem.paidQuantity),
				unitPricing: {
					quantity: isFlatFee
						? 1
						: new Decimal(band.quantity).div(billingUnits).toNumber(),
					unitAmount: band.unitAmount,
				},
			};
		})
		.filter((bandLineItem) => bandLineItem.amount !== 0);

	return bandLineItems.length > 0 ? bandLineItems : [lineItem];
};
