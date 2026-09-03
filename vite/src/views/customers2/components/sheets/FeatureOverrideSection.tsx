import type { CreditSchemaItem, FullCustomerEntitlement } from "@autumn/shared";
import { getFeatureName, numberWithCommas } from "@autumn/shared";
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

/** Read-only view of the plan item's custom rate card (feature_override) —
 * shown when this balance prices its metered features differently from the
 * credit system's default schema. Mirrors RolloversSection. */
export function FeatureOverrideSection({
	selectedCusEnt,
}: {
	selectedCusEnt: FullCustomerEntitlement;
}) {
	const { features } = useFeaturesQuery();
	const schema = selectedCusEnt.entitlement.feature_override?.schema;

	if (!schema?.length) return null;

	return (
		<SheetSection withSeparator>
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-1.5 text-tertiary-foreground text-sm font-medium">
					<CoinsIcon size={14} weight="duotone" />
					Custom rate card
				</div>
				<div className="flex flex-col gap-1.5">
					{schema.map((item) => (
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
								{rateText(item)}
							</span>
						</div>
					))}
				</div>
				<div className="text-xs text-subtle px-2">
					Overrides the credit system's default rates for this plan.
				</div>
			</div>
		</SheetSection>
	);
}
