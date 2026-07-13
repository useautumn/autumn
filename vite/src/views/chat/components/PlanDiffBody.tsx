import {
	type ApiPlanV1,
	type Feature,
	formatAmount,
	formatInterval,
	type PlanUpdatePreviewItemChange,
	type PlanUpdatePreviewPriceChange,
} from "@autumn/shared";
import { ItemChangeList } from "@/components/v2/ItemChangeList";
import {
	PlanSettingsChanges,
	previousAttributesToSettingChanges,
} from "@/views/products/plan/versioning/PlanSettingsChanges";

/** The three diff fields every previewed plan/variant/other-version shares
 * (`CorePlanUpdatePreviewSchema`). Named out explicitly rather than via
 * `Pick<CatalogPlanPreview, ...>` — the zod-inferred catalog type is deep
 * enough that TS widens parts of it to `any`, which breaks structural
 * assignability from a plain `PlanUpdatePreviewVariant`/`OtherVersion`. */
type PlanDiffSource = {
	item_changes?: PlanUpdatePreviewItemChange[];
	previous_attributes?: Record<string, unknown> | null;
	price_change?: PlanUpdatePreviewPriceChange;
};

const priceText = (price: ApiPlanV1["price"]) => {
	if (!price) return "Free";
	if (price.display?.primary_text) {
		return [price.display.primary_text, price.display.secondary_text]
			.filter(Boolean)
			.join(" ");
	}
	const amount = formatAmount({
		amount: price.amount,
		amountFormatOptions: {
			currencyDisplay: "narrowSymbol",
			maximumFractionDigits: 10,
		},
	});
	const interval = formatInterval({
		interval: price.interval,
		intervalCount: price.interval_count,
	});
	return interval ? `${amount} ${interval}` : amount;
};

/** The base plan's price before/after, when the previewed update changes it. */
function PriceChangeRow({ plan }: { plan: PlanDiffSource }) {
	if (!plan.price_change) return null;
	return (
		<div className="flex items-center gap-1.5 text-xs">
			<span className="font-medium text-foreground">Price</span>
			<span className="text-tertiary-foreground">
				{priceText(plan.price_change.previous)}
			</span>
			<span className="text-subtle">-&gt;</span>
			<span className="font-medium text-foreground">
				{priceText(plan.price_change.current)}
			</span>
		</div>
	);
}

const hasBody = (plan: PlanDiffSource) =>
	(plan.item_changes?.length ?? 0) > 0 ||
	plan.price_change !== undefined ||
	previousAttributesToSettingChanges(plan.previous_attributes).length > 0;

/** Shared diff renderer for a single previewed plan change: item changes,
 * real price before/after, and setting changes. Used by both the catalog
 * approval card and the pre-approval decision card, so the two never drift. */
export function PlanDiffBody({
	features,
	plan,
}: {
	features?: Feature[];
	plan: PlanDiffSource;
}) {
	if (!hasBody(plan)) {
		return (
			<span className="text-tertiary-foreground/70 text-xs italic">
				No plan changes
			</span>
		);
	}
	return (
		<div className="flex flex-col gap-2">
			<ItemChangeList
				features={features}
				itemChanges={plan.item_changes ?? []}
			/>
			<PriceChangeRow plan={plan} />
			<PlanSettingsChanges
				changes={previousAttributesToSettingChanges(plan.previous_attributes)}
			/>
		</div>
	);
}
