import {
	type ApiPlanV1,
	type Feature,
	formatAmount,
	formatInterval,
	type PlanUpdatePreviewItemChange,
	type PlanUpdatePreviewPriceChange,
} from "@autumn/shared";
import {
	AdditionalCurrenciesHint,
	getCurrencyChangeStates,
} from "@/views/products/plan/components/plan-card/AdditionalCurrenciesHint";
import {
	PlanSettingsChanges,
	previousAttributesToSettingChanges,
} from "@/views/products/plan/versioning/PlanSettingsChanges";
import { ItemChangeList } from "./ItemChangeList";

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

const hasBody = (plan: PlanDiffSource) =>
	(plan.item_changes?.length ?? 0) > 0 ||
	plan.price_change !== undefined ||
	previousAttributesToSettingChanges(plan.previous_attributes).length > 0;

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
	const previousCurrencies =
		plan.price_change?.previous?.additional_currencies ?? [];
	const currentCurrencies =
		plan.price_change?.current?.additional_currencies ?? [];
	const previousCurrencyStates = getCurrencyChangeStates({
		entries: previousCurrencies,
		others: currentCurrencies,
		missingState: "removed",
	});
	const currentCurrencyStates = getCurrencyChangeStates({
		entries: currentCurrencies,
		others: previousCurrencies,
		missingState: "added",
	});

	return (
		<div className="flex flex-col gap-2">
			<ItemChangeList
				features={features}
				itemChanges={plan.item_changes ?? []}
			/>
			{plan.price_change && (
				<div className="flex items-center gap-1.5 text-xs">
					<span className="font-medium text-foreground">Price</span>
					<span className="text-tertiary-foreground">
						{priceText(plan.price_change.previous)}
					</span>
					{previousCurrencies.length > 0 && (
						<AdditionalCurrenciesHint
							changeStates={previousCurrencyStates}
							currencies={previousCurrencies}
						/>
					)}
					<span className="text-subtle">-&gt;</span>
					<span className="font-medium text-foreground">
						{priceText(plan.price_change.current)}
					</span>
					{currentCurrencies.length > 0 && (
						<AdditionalCurrenciesHint
							changeStates={currentCurrencyStates}
							currencies={currentCurrencies}
						/>
					)}
				</div>
			)}
			<PlanSettingsChanges
				changes={previousAttributesToSettingChanges(plan.previous_attributes)}
			/>
		</div>
	);
}
