import type { CreditSchemaItem, FullCustomerEntitlement } from "@autumn/shared";
import { hasCreditDimensionRules, numberWithCommas } from "@autumn/shared";
import { CoinsIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { featureDisplayName } from "@/views/products/features/credit-systems/utils/featureDisplayName";

const countLabel = (count: number, noun: string) =>
	`${count} ${noun}${count === 1 ? "" : "s"}`;

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

const dimensionedRateText = (item: CreditSchemaItem) => {
	const parts: string[] = [];
	const dimensions = Object.keys(item.dimensions ?? {}).length;
	const multipliers = Object.keys(item.multipliers ?? {}).length;
	if (dimensions) parts.push(countLabel(dimensions, "rate"));
	if (multipliers) parts.push(countLabel(multipliers, "multiplier"));
	return `varies by event · ${parts.join(", ")}`;
};

const OverrideRow = ({
	label,
	value,
}: {
	label: ReactNode;
	value: ReactNode;
}) => (
	<div className="flex items-center justify-between text-sm px-2 py-0.5 rounded-md">
		<span className="text-foreground font-medium">{label}</span>
		<span className="text-tertiary-foreground text-xs">{value}</span>
	</div>
);

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

	const providerMarkups = Object.entries(markups?.provider_markups ?? {});
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
						<OverrideRow
							key={`feature-${item.metered_feature_id}`}
							label={featureDisplayName({
								features,
								featureId: item.metered_feature_id,
								plural: true,
								capitalize: true,
							})}
							value={
								hasCreditDimensionRules(item)
									? dimensionedRateText(item)
									: rateText(item)
							}
						/>
					))}
					{markups && (
						<OverrideRow
							label="Default"
							value={`${markups.default_markup ?? 0}% markup`}
						/>
					)}
					{providerMarkups.map(([providerKey, entry]) => (
						<OverrideRow
							key={`provider-${providerKey}`}
							label={providerKey}
							value={`${entry?.markup ?? 0}% markup`}
						/>
					))}
					{modelMarkupCount > 0 && (
						<OverrideRow
							label="Per-model"
							value={countLabel(modelMarkupCount, "model")}
						/>
					)}
				</div>

				<div className="text-xs text-subtle px-2">
					Overrides the credit system's defaults for this plan.
				</div>
			</div>
		</SheetSection>
	);
}
