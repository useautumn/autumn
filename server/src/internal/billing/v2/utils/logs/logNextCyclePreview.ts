import type {
	BillingPreviewResponse,
	FullCusProduct,
	LineItem,
} from "@autumn/shared";
import { formatMs } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { NextCyclePreviewDebug } from "../billingPlan/billingPlanToNextCyclePreview";

const formatCustomerProduct = (customerProduct: FullCusProduct) =>
	`${customerProduct.product.name} (${customerProduct.product_id}) [${customerProduct.status}]`;

const formatLineItem = (item: LineItem) =>
	`${item.description}: ${item.finalAmount} (charge: ${item.chargeImmediately})`;

export const logBillingPreview = ({
	ctx,
	allLineItems,
	immediateLineItems,
	total,
	currency,
	nextCycleDebug,
	nextCycle,
}: {
	ctx: AutumnContext;
	allLineItems: LineItem[];
	immediateLineItems: LineItem[];
	total: number;
	currency: string;
	nextCycleDebug: NextCyclePreviewDebug;
	nextCycle: BillingPreviewResponse["next_cycle"];
}) => {
	const {
		allCustomerProducts,
		currentCustomerProducts,
		smallestInterval,
		anchorMs,
		nextCycleStart,
		filteredCustomerProducts,
	} = nextCycleDebug;

	addToExtraLogs({
		ctx,
		extras: {
			billingPreview: {
				// Immediate charge breakdown
				total: `${total} ${currency}`,
				allLineItems: allLineItems.map(formatLineItem).join(" | ") || "none",
				immediateLineItems:
					immediateLineItems.map(formatLineItem).join(" | ") || "none",

				// Next cycle calculation
				nextCycle: {
					allCustomerProducts:
						allCustomerProducts.map(formatCustomerProduct).join(", ") || "none",
					currentCustomerProducts:
						currentCustomerProducts.map(formatCustomerProduct).join(", ") ||
						"none",
					smallestInterval: smallestInterval
						? `${smallestInterval.intervalCount} ${smallestInterval.interval}`
						: "none (not a subscription)",
					anchor: formatMs(anchorMs),
					nextCycleStart: nextCycleStart ? formatMs(nextCycleStart) : "n/a",
					filteredCustomerProducts:
						filteredCustomerProducts.map(formatCustomerProduct).join(", ") ||
						"none",
					result: nextCycle
						? `starts: ${formatMs(nextCycle.starts_at)} | total: ${nextCycle.total} | items: ${nextCycle.line_items.length}`
						: "undefined",
				},
			},
		},
	});
};
