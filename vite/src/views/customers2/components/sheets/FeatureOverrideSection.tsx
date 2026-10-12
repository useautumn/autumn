import type { FullCustomerEntitlement } from "@autumn/shared";
import { CoinsIcon } from "@phosphor-icons/react";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { OverrideRow } from "./OverrideRow";

const countLabel = (count: number, noun: string) =>
	`${count} ${noun}${count === 1 ? "" : "s"}`;

export function FeatureOverrideSection({
	selectedCusEnt,
}: {
	selectedCusEnt: FullCustomerEntitlement;
}) {
	const markups = selectedCusEnt.entitlement.feature_override?.markups;

	if (!markups) return null;

	const providerMarkups = Object.entries(markups.provider_markups ?? {});
	const modelMarkupCount = Object.keys(markups.model_markups ?? {}).length;

	return (
		<SheetSection withSeparator>
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-1.5 text-tertiary-foreground text-sm font-medium">
					<CoinsIcon size={14} weight="duotone" />
					Custom markup
				</div>

				<div className="flex flex-col gap-1.5">
					<OverrideRow
						label="Default"
						value={`${markups.default_markup ?? 0}% markup`}
					/>
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
