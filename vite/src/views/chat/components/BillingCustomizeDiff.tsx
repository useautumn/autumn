import {
	type ApiPlanV1,
	type CustomizePlanV1,
	formatAmount,
	formatInterval,
} from "@autumn/shared";
import { ItemStatusDot } from "@/components/v2/ItemStatusDot";

const priceText = (price: {
	amount: number;
	interval?: string | null;
	interval_count?: number;
}) => {
	const amount = formatAmount({
		amount: price.amount,
		amountFormatOptions: {
			currencyDisplay: "narrowSymbol",
			maximumFractionDigits: 10,
		},
	});
	const interval = formatInterval({
		// biome-ignore lint/suspicious/noExplicitAny: interval unions across param schemas
		interval: price.interval as any,
		intervalCount: price.interval_count,
	});
	return interval ? `${amount} ${interval}` : amount;
};

const asItems = (value: unknown): Record<string, unknown>[] =>
	Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

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

/** The customer-specific terms of a billing action (`params.customize`) as a
 * patch against the catalog plan — price old→new plus added/removed items,
 * mirroring the update-subscription sheet's plan-configuration block. */
export function BillingCustomizeDiff({
	currentPlan,
	customize,
}: {
	/** The plan being replaced (for the price "from" side), when known. */
	currentPlan?: ApiPlanV1 | null;
	customize: CustomizePlanV1 | Record<string, unknown>;
}) {
	const patch = customize as {
		add_items?: unknown;
		price?: { amount: number; interval?: string; interval_count?: number };
		remove_items?: unknown;
	};
	const added = asItems(patch.add_items);
	const removed = asItems(patch.remove_items);
	const hasContent = patch.price || added.length > 0 || removed.length > 0;
	if (!hasContent) return null;

	return (
		<div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5">
			<span className="font-medium text-tertiary-foreground text-xs">
				Custom terms
			</span>
			{patch.price && (
				<div className="flex items-center gap-1.5 text-sm">
					{currentPlan?.price && (
						<>
							<span className="text-tertiary-foreground">
								{priceText(currentPlan.price)}
							</span>
							<span className="text-subtle">-&gt;</span>
						</>
					)}
					<span className="font-semibold text-foreground">
						{priceText(patch.price)}
					</span>
				</div>
			)}
			{added.map((item, index) => (
				<div
					className="flex items-center gap-2 text-xs"
					key={`added-${itemLabel(item)}-${index}`}
				>
					<ItemStatusDot state="new" />
					<span className="text-foreground">{itemLabel(item)}</span>
				</div>
			))}
			{removed.map((item, index) => (
				<div
					className="flex items-center gap-2 text-xs"
					key={`removed-${itemLabel(item)}-${index}`}
				>
					<ItemStatusDot state="removed" />
					<span className="text-tertiary-foreground line-through">
						{itemLabel(item)}
					</span>
				</div>
			))}
		</div>
	);
}
