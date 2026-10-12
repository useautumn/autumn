import type { FullCustomerEntitlement } from "@autumn/shared";
import { CoinsIcon } from "@phosphor-icons/react";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { featureOverrideRateCard } from "@/utils/product/featureOverrideRates";
import { OverrideRow } from "./OverrideRow";

export function FeatureOverrideSection({
	selectedCusEnt,
}: {
	selectedCusEnt: FullCustomerEntitlement;
}) {
	const { features } = useFeaturesQuery();
	const override = selectedCusEnt.entitlement.feature_override;

	if (!(override?.schema?.length || override?.markups)) return null;

	return (
		<SheetSection withSeparator>
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-1.5 text-tertiary-foreground text-sm font-medium">
					<CoinsIcon size={14} weight="duotone" />
					{override.schema?.length ? "Custom rate card" : "Custom markup"}
				</div>

				<div className="flex flex-col gap-1.5">
					{featureOverrideRateCard({ override, features }).map((line) => (
						<OverrideRow key={line.key} label={line.label} value={line.value} />
					))}
				</div>

				<div className="text-xs text-subtle px-2">
					Overrides the credit system's defaults for this plan.
				</div>
			</div>
		</SheetSection>
	);
}
