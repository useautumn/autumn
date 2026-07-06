import {
	formatAmount,
	formatInterval,
	formatTiers,
	getProductItemDisplay,
	type ProductItem,
	TierBehavior,
	TierInfinite,
	UsageModel,
} from "@autumn/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import type { ReactNode } from "react";
import { RolloverIndicator } from "@/components/v2/RolloverIndicator";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { intervalIsNone } from "@/utils/product/productItemUtils";
import { PlanFeatureIcon } from "@/views/products/plan/components/plan-card/PlanFeatureIcon";

export const CustomDotIcon = () => (
	<div className="w-[2px] h-[2px] mx-0.5 bg-current rounded-full" />
);

/** The left/dot/right feature icon trio. Shared so every item row renders the
 * same glyphs, including non-label rows like the migration filter rows. */
export const FeatureIconCluster = ({ item }: { item: ProductItem }) => (
	<div className="flex flex-row items-center gap-1 shrink-0 pointer-events-auto">
		<PlanFeatureIcon item={item} position="left" />
		<CustomDotIcon />
		<PlanFeatureIcon item={item} position="right" />
	</div>
);

const NARROW_SYMBOL = { currencyDisplay: "narrowSymbol" } as const;

/** Subtle chip around the price amount. */
const PRICE_CHIP_CLASS =
	"bg-muted px-1.5 py-0.5 rounded-md text-muted-foreground";

const isTieredPrice = (item: ProductItem): boolean =>
	(item.tiers?.length ?? 0) > 1;

/** A rollover config can sit on any item of a feature; only items with a
 * resetting included/prepaid balance actually roll anything over. */
const itemCanRollOver = (item: ProductItem): boolean => {
	if (!item.feature_id) return false;
	if (intervalIsNone(item.interval)) return false;
	const includedUsage =
		typeof item.included_usage === "number" ? item.included_usage : 0;
	return includedUsage > 0 || item.usage_model === UsageModel.Prepaid;
};

/** Volume-based tiers priced as a flat amount per band — the real price lives in
 * `flat_amount`, matching getFeaturePriceItemDisplay's formatting. */
const isVolumeFlatAmountItem = (item: ProductItem): boolean =>
	item.tier_behavior === TierBehavior.VolumeBased &&
	(item.tiers ?? []).every((tier) => tier.amount === 0) &&
	(item.tiers ?? []).some((tier) => (tier.flat_amount ?? 0) > 0);

/** The exact price substring the shared display embeds in `secondary_text`,
 * for both tiered and flat per-unit prices. */
const priceString = (
	item: ProductItem,
	currency: string,
): string | undefined => {
	if (isVolumeFlatAmountItem(item)) {
		return formatTiers({
			item,
			currency,
			amountFormatOptions: NARROW_SYMBOL,
			useFlatAmount: true,
		});
	}
	if (item.tiers && item.tiers.length > 0) {
		return formatTiers({ item, currency, amountFormatOptions: NARROW_SYMBOL });
	}
	if (item.price != null) {
		return formatAmount({
			currency,
			amount: item.price,
			amountFormatOptions: NARROW_SYMBOL,
		});
	}
	return undefined;
};

function priceFieldRows(item: ProductItem): { label: string; value: string }[] {
	const rows = [
		{
			label: "Type",
			value:
				item.tier_behavior === TierBehavior.VolumeBased
					? "Volume"
					: "Graduated",
		},
	];

	if (item.billing_units && item.billing_units > 1) {
		rows.push({ label: "Billing units", value: String(item.billing_units) });
	}
	if (item.usage_model) {
		rows.push({
			label: "Billed",
			value:
				item.usage_model === UsageModel.Prepaid ? "Prepaid" : "Pay per use",
		});
	}
	if (!intervalIsNone(item.interval)) {
		const interval = formatInterval({
			interval: item.interval ?? undefined,
			intervalCount: item.interval_count ?? undefined,
			prefix: "",
		});
		if (interval) rows.push({ label: "Interval", value: interval });
	}

	return rows;
}

function priceTierRows(
	item: ProductItem,
	currency: string,
): { range: string; value: string }[] {
	// Tiers store `to` relative to the granted usage, so add it back to show the
	// same absolute boundaries as the editor (PriceTiers' getTierToDisplay).
	const includedUsage =
		typeof item.included_usage === "number" ? item.included_usage : 0;

	const fmt = (amount: number) =>
		formatAmount({
			currency,
			amount,
			amountFormatOptions: { currencyDisplay: "narrowSymbol" },
		});

	const rows: { range: string; value: string }[] = [];
	if (includedUsage > 0) {
		rows.push({ range: `0–${includedUsage}`, value: "Included" });
	}

	let from = includedUsage;
	for (const tier of item.tiers ?? []) {
		const isInfinite = tier.to === TierInfinite;
		const to = typeof tier.to === "number" ? tier.to + includedUsage : tier.to;
		const range = isInfinite ? `${from}+` : `${from}–${to}`;
		if (!isInfinite && typeof to === "number") from = to;

		const parts: string[] = [];
		if (tier.amount) parts.push(fmt(tier.amount));
		if (tier.flat_amount) parts.push(`${fmt(tier.flat_amount)} flat`);

		rows.push({ range, value: parts.length > 0 ? parts.join(" + ") : "Free" });
	}

	return rows;
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-6">
			<span className="text-body-secondary">{label}</span>
			<span className="tabular-nums">{value}</span>
		</div>
	);
}

/** The price amount as a chip that reveals the full tier breakdown on hover. */
function TierBreakdownChip({
	item,
	currency,
	priceStr,
}: {
	item: ProductItem;
	currency: string;
	priceStr: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{/* pointer-events-auto: read-only rows disable pointer events, which
				 * would otherwise swallow the hover that opens this tooltip. */}
				<span
					className={cn(PRICE_CHIP_CLASS, "cursor-help pointer-events-auto")}
				>
					{priceStr}
				</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-xs" side="top">
				<div className="flex flex-col gap-2">
					<div className="flex flex-col gap-0.5">
						{priceFieldRows(item).map((row) => (
							<KeyValueRow
								key={row.label}
								label={row.label}
								value={row.value}
							/>
						))}
					</div>
					<div className="flex flex-col gap-0.5 border-t border-border/40 pt-1.5">
						{priceTierRows(item, currency).map((tier) => (
							<KeyValueRow
								key={`${tier.range}-${tier.value}`}
								label={tier.range}
								value={tier.value}
							/>
						))}
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}

/** Renders the price secondary text with the price amount as a chip.
 * Tiered prices also reveal the full tier breakdown on hover. */
function PriceText({
	item,
	currency,
	text,
}: {
	item: ProductItem;
	currency: string;
	text: string;
}) {
	const priceStr = priceString(item, currency);
	const priceIndex = priceStr ? text.indexOf(priceStr) : -1;

	if (!priceStr || priceIndex === -1) {
		return <span className="text-body-secondary"> {text}</span>;
	}

	return (
		<span className="text-body-secondary">
			{" "}
			{text.slice(0, priceIndex)}
			{isTieredPrice(item) ? (
				<TierBreakdownChip
					currency={currency}
					item={item}
					priceStr={priceStr}
				/>
			) : (
				<span className="text-body">{priceStr}</span>
			)}
			{text.slice(priceIndex + priceStr.length)}
		</span>
	);
}

interface PlanItemLabelProps {
	item: ProductItem;
	/** Wraps the feature icon cluster, e.g. with AdminHover in the plan editor. */
	wrapIcons?: (icons: ReactNode) => ReactNode;
	/** Text shown when the feature has no name yet. */
	unnamedText?: string;
}

/** Feature icon cluster + label text + rollover indicator. Shared by the plan
 * editor card row and the read-only subscription/diff rows so they read the same. */
export function PlanItemLabel({
	item,
	wrapIcons,
	unnamedText = "Name your feature",
}: PlanItemLabelProps) {
	const { org } = useOrg();
	const { features } = useFeaturesQuery();
	const currency = org?.default_currency || "USD";

	const display = getProductItemDisplay({
		item,
		features,
		currency,
		fullDisplay: true,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

	const feature = features.find((f) => f.id === item.feature_id);
	const hasFeatureName = feature?.name && feature.name.trim() !== "";
	const displayText = hasFeatureName ? display.primary_text : unnamedText;
	const rollover = itemCanRollOver(item) ? item.config?.rollover : undefined;

	const icons = <FeatureIconCluster item={item} />;

	return (
		<>
			{wrapIcons ? wrapIcons(icons) : icons}
			<p className="whitespace-nowrap truncate flex-1 min-w-0 text-body-secondary">
				<span className={cn("text-body", !hasFeatureName && "text-subtle!")}>
					{displayText}
				</span>
				{display.secondary_text && (
					<PriceText
						currency={currency}
						item={item}
						text={display.secondary_text}
					/>
				)}
			</p>
			{rollover && <RolloverIndicator rollover={rollover} />}
		</>
	);
}
