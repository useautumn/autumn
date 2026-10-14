import {
	type Feature,
	formatAmount,
	formatInterval,
	formatTiers,
	getProductItemDisplay,
	isVolumeFlatFeeTiers,
	type ProductItem,
	TierBehavior,
	UsageModel,
} from "@autumn/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import type { ReactNode } from "react";
import { RolloverIndicator } from "@/components/v2/RolloverIndicator";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { intervalIsNone } from "@/utils/product/productItemUtils";
import { AdditionalCurrenciesHint } from "@/views/products/plan/components/plan-card/AdditionalCurrenciesHint";
import { PlanFeatureIcon } from "@/views/products/plan/components/plan-card/PlanFeatureIcon";
import {
	itemToTierRows,
	itemToVolumeTierRule,
} from "@/views/products/plan/utils/tierUtils";
import { getItemAdditionalCurrencies } from "./planItemCurrencyUtils";

export const CustomDotIcon = () => (
	<div className="w-[2px] h-[2px] mx-0.5 bg-current rounded-full" />
);

export const FeatureIconCluster = ({
	item,
	leftIcon,
}: {
	item: ProductItem;
	leftIcon?: ReactNode;
}) => (
	<div className="flex flex-row items-center gap-1 shrink-0 pointer-events-auto">
		{leftIcon ?? <PlanFeatureIcon item={item} position="left" />}
		<CustomDotIcon />
		<PlanFeatureIcon item={item} position="right" />
	</div>
);

const NARROW_SYMBOL = { currencyDisplay: "narrowSymbol" } as const;

const PRICE_CHIP_CLASS =
	"bg-muted px-1.5 py-0.5 rounded-md text-muted-foreground";

const TIER_TOOLTIP_DELAY_MS = 100;

const isTieredPrice = (item: ProductItem): boolean =>
	(item.tiers?.length ?? 0) > 1;

const itemCanRollOver = (item: ProductItem): boolean => {
	if (!item.feature_id) return false;
	if (intervalIsNone(item.interval)) return false;
	const includedUsage =
		typeof item.included_usage === "number" ? item.included_usage : 0;
	return includedUsage > 0 || item.usage_model === UsageModel.Prepaid;
};

const priceString = (
	item: ProductItem,
	currency: string,
): string | undefined => {
	if (
		isVolumeFlatFeeTiers({
			tierBehavior: item.tier_behavior,
			tiers: item.tiers,
		})
	) {
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

function KeyValueRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-6">
			<span className="text-body-secondary">{label}</span>
			<span className="tabular-nums">{value}</span>
		</div>
	);
}

function TierBreakdownChip({
	item,
	currency,
	priceStr,
}: {
	item: ProductItem;
	currency: string;
	priceStr: string;
}) {
	const volumeRule = itemToVolumeTierRule({ item });
	return (
		<Tooltip delayDuration={TIER_TOOLTIP_DELAY_MS}>
			<TooltipTrigger asChild>
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
						{itemToTierRows({ item, currency }).map((tier) => (
							<KeyValueRow
								key={`${tier.range}-${tier.value}`}
								label={tier.range}
								value={tier.value}
							/>
						))}
					</div>
					{volumeRule && (
						<p className="text-body-secondary border-t border-border/40 pt-1.5">
							{volumeRule}
						</p>
					)}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}

function highlightPrice({
	item,
	currency,
	text,
	renderPrice,
}: {
	item: ProductItem;
	currency: string;
	text: string;
	renderPrice: (priceStr: string) => ReactNode;
}): ReactNode {
	const priceStr = priceString(item, currency);
	const priceIndex = priceStr ? text.indexOf(priceStr) : -1;
	if (!priceStr || priceIndex === -1) return null;

	return (
		<>
			{text.slice(0, priceIndex)}
			{renderPrice(priceStr)}
			{text.slice(priceIndex + priceStr.length)}
		</>
	);
}

function tieredPriceChip(args: {
	item: ProductItem;
	currency: string;
	text: string;
}): ReactNode {
	if (!isTieredPrice(args.item)) return null;
	return highlightPrice({
		...args,
		renderPrice: (priceStr) => (
			<TierBreakdownChip
				currency={args.currency}
				item={args.item}
				priceStr={priceStr}
			/>
		),
	});
}

function PriceText({
	item,
	currency,
	text,
	compact = false,
}: {
	item: ProductItem;
	currency: string;
	text: string;
	compact?: boolean;
}) {
	const secondaryClass = compact
		? "text-xs text-subtle"
		: "text-body-secondary";
	const amountClass = compact ? "text-xs font-medium" : "text-body";
	const content =
		tieredPriceChip({ item, currency, text }) ??
		highlightPrice({
			item,
			currency,
			text,
			renderPrice: (priceStr) => (
				<span className={amountClass}>{priceStr}</span>
			),
		}) ??
		text;

	return <span className={secondaryClass}> {content}</span>;
}

interface PlanItemLabelProps {
	item: ProductItem;
	wrapIcons?: (icons: ReactNode) => ReactNode;
	unnamedText?: string;
	compact?: boolean;
	currency?: string;
	feature?: Feature;
	featureIcon?: ReactNode;
	showFeatureIcons?: boolean;
}

export function PlanItemLabel({
	item,
	wrapIcons,
	unnamedText = "Name your feature",
	compact = false,
	currency: currencyOverride,
	feature: featureOverride,
	featureIcon,
	showFeatureIcons = true,
}: PlanItemLabelProps) {
	const { org } = useOrg();
	const { features: queriedFeatures } = useFeaturesQuery();
	const features = featureOverride ? [featureOverride] : queriedFeatures;
	const currency = currencyOverride || org?.default_currency || "USD";

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
	const additionalCurrencies = getItemAdditionalCurrencies(item);

	const icons = showFeatureIcons ? (
		<FeatureIconCluster item={item} leftIcon={featureIcon} />
	) : null;

	return (
		<>
			{wrapIcons ? wrapIcons(icons) : icons}
			<p
				className={cn(
					"whitespace-nowrap truncate flex-1 min-w-0",
					compact ? "text-xs text-subtle" : "text-body-secondary",
				)}
			>
				<span
					className={cn(
						compact ? "text-xs font-medium" : "text-body",
						!hasFeatureName && "text-subtle!",
					)}
				>
					{hasFeatureName
						? (tieredPriceChip({ item, currency, text: displayText }) ??
							displayText)
						: displayText}
				</span>
				{display.secondary_text && (
					<PriceText
						compact={compact}
						currency={currency}
						item={item}
						text={display.secondary_text}
					/>
				)}
			</p>
			{additionalCurrencies.length > 0 && (
				<AdditionalCurrenciesHint currencies={additionalCurrencies} />
			)}
			{rollover && <RolloverIndicator rollover={rollover} />}
		</>
	);
}
