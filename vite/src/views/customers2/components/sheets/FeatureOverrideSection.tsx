import type { CreditSchemaItem, FullCustomerEntitlement } from "@autumn/shared";
import {
	getFeatureName,
	hasCreditDimensionRules,
	numberWithCommas,
} from "@autumn/shared";
import { CoinsIcon } from "@phosphor-icons/react";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";

const rateText = (item: CreditSchemaItem) => {
	const perUnits =
		(item.feature_amount ?? 1) !== 1
			? ` per ${numberWithCommas(item.feature_amount ?? 1)}`
			: "";

	if (item.tier_behavior === "graduated") {
		const costs = item.tiers.map((tier) => tier.credit_amount);
		return `${Math.min(...costs)}–${Math.max(...costs)} credits (tiered)${perUnits}`;
	}

	return `${numberWithCommas(item.credit_amount)} credits${perUnits}`;
};

/** The rate depends on the tracked event's properties, so a single number
 * would misrepresent what actually bills. */
const dimensionedRateText = (item: CreditSchemaItem) => {
	const dimensionCount = Object.keys(item.dimensions ?? {}).length;
	const multiplierCount = Object.keys(item.multipliers ?? {}).length;
	const parts = [
		dimensionCount > 0
			? `${dimensionCount} rate${dimensionCount === 1 ? "" : "s"}`
			: null,
		multiplierCount > 0
			? `${multiplierCount} multiplier${multiplierCount === 1 ? "" : "s"}`
			: null,
	].filter(Boolean);

	return `varies by event · ${parts.join(", ")}`;
};

/** Read-only view of the plan item's override (feature_override) — shown when
 * this balance prices its metered features, or its AI markups, differently
 * from the credit system's defaults. Mirrors RolloversSection. */
export function FeatureOverrideSection({
	selectedCusEnt,
}: {
	selectedCusEnt: FullCustomerEntitlement;
}) {
	const { features } = useFeaturesQuery();
	const override = selectedCusEnt.entitlement.feature_override;
	const schema = override?.schema;
	const markups = override?.markups;

	if (!(schema?.length || markups)) return null;

	const providerMarkupEntries = Object.entries(markups?.provider_markups ?? {});
	const modelMarkupCount = Object.keys(markups?.model_markups ?? {}).length;

	return (
		<SheetSection withSeparator>
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-1.5 text-tertiary-foreground text-sm font-medium">
					<CoinsIcon size={14} weight="duotone" />
					{schema?.length ? "Custom rate card" : "Custom markup"}
				</div>

				<div className="flex flex-col gap-1.5">
					{schema?.map((item) => (
						<div
							key={item.metered_feature_id}
							className="flex items-center justify-between text-sm px-2 py-0.5 rounded-md"
						>
							<span className="text-foreground font-medium">
								{getFeatureName({
									feature: features.find(
										(feature) => feature.id === item.metered_feature_id,
									),
									plural: true,
									capitalize: true,
								}) || item.metered_feature_id}
							</span>
							<span className="text-tertiary-foreground text-xs">
								{hasCreditDimensionRules(item)
									? dimensionedRateText(item)
									: rateText(item)}
							</span>
						</div>
					))}

					{markups && (
						<div className="flex items-center justify-between text-sm px-2 py-0.5 rounded-md">
							<span className="text-foreground font-medium">Default</span>
							<span className="text-tertiary-foreground text-xs">
								{markups.default_markup ?? 0}% markup
							</span>
						</div>
					)}

					{providerMarkupEntries.map(([providerKey, entry]) => (
						<div
							key={providerKey}
							className="flex items-center justify-between text-sm px-2 py-0.5 rounded-md"
						>
							<span className="text-foreground font-medium">{providerKey}</span>
							<span className="text-tertiary-foreground text-xs">
								{entry?.markup ?? 0}% markup
							</span>
						</div>
					))}

					{modelMarkupCount > 0 && (
						<div className="flex items-center justify-between text-sm px-2 py-0.5 rounded-md">
							<span className="text-foreground font-medium">Per-model</span>
							<span className="text-tertiary-foreground text-xs">
								{modelMarkupCount} model
								{modelMarkupCount === 1 ? "" : "s"}
							</span>
						</div>
					)}
				</div>

				<div className="text-xs text-subtle px-2">
					Overrides the credit system's defaults for this plan.
				</div>
			</div>
		</SheetSection>
	);
}
