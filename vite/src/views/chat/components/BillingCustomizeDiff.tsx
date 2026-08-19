import { buildCustomizeChanges, type CustomizeChange } from "@autumn/render";
import {
	type ApiPlanV1,
	type CustomizePlanV1,
	formatAmount,
	formatInterval,
} from "@autumn/shared";
import { ItemStatusDot } from "@/components/v2/ItemStatusDot";

const priceText = (price: Record<string, unknown>) => {
	const amount = typeof price.amount === "number" ? price.amount : 0;
	const formatted = formatAmount({
		amount,
		amountFormatOptions: {
			currencyDisplay: "narrowSymbol",
			maximumFractionDigits: 10,
		},
	});
	const interval = formatInterval({
		// biome-ignore lint/suspicious/noExplicitAny: interval unions across param schemas
		interval: price.interval as any,
		intervalCount:
			typeof price.interval_count === "number"
				? price.interval_count
				: undefined,
	});
	return interval ? `${formatted} ${interval}` : formatted;
};

const itemLabel = (item: Record<string, unknown>) => {
	const feature = typeof item.feature_id === "string" ? item.feature_id : "";
	const included =
		typeof item.included === "number"
			? `${item.included.toLocaleString("en-US")} `
			: "";
	const price = item.price as { amount?: number } | undefined;
	const priced = typeof price?.amount === "number" ? ` · $${price.amount}` : "";
	return `${included}${feature}${priced}` || "item";
};

const changeLabel = (change: CustomizeChange) =>
	change.subject === "price"
		? `Base price ${priceText(change.price)}`
		: itemLabel(change.item);

/** The customer-specific terms of a billing action as adds and removes against
 * the current plan. The diff itself lives in @autumn/render so Slack and the
 * dashboard render the same changes. */
export function BillingCustomizeDiff({
	currentPlan,
	customize,
}: {
	/** The plan being replaced, when known. */
	currentPlan?: ApiPlanV1 | null;
	customize: CustomizePlanV1 | Record<string, unknown>;
}) {
	const changes = buildCustomizeChanges({ currentPlan, customize });
	if (changes.length === 0) return null;

	return (
		<div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5">
			<span className="font-medium text-tertiary-foreground text-xs">
				Custom terms
			</span>
			{changes.map((change, index) => (
				<div
					className="flex items-center gap-2 text-xs"
					key={`${change.kind}-${changeLabel(change)}-${index}`}
				>
					<ItemStatusDot state={change.kind === "add" ? "new" : "removed"} />
					<span
						className={
							change.kind === "add"
								? "text-foreground"
								: "text-tertiary-foreground line-through"
						}
					>
						{changeLabel(change)}
					</span>
				</div>
			))}
		</div>
	);
}
