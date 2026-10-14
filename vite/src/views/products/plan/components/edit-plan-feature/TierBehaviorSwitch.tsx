import { TierBehavior } from "@autumn/shared";
import { FormLabel, GroupedTabButton, InfoTooltip } from "@autumn/ui";

const TIER_BEHAVIOR_OPTIONS = [
	{ value: TierBehavior.VolumeBased, label: "Volume" },
	{ value: TierBehavior.Graduated, label: "Graduated" },
];

export function TierBehaviorSwitch({
	tierBehavior,
	unit,
	onChange,
}: {
	tierBehavior: TierBehavior;
	unit: string;
	onChange: (tierBehavior: string) => void;
}) {
	const explanation =
		tierBehavior === TierBehavior.VolumeBased
			? `Total usage picks one tier. Usage past the included amount is billed at the reached tier's rate, every ${unit} at the same rate, plus that tier's flat fee.`
			: "Each tier bills the usage that falls inside it, and the tiers add up.";

	return (
		<div className="flex flex-col gap-1.5">
			<FormLabel className="mb-0 flex items-center gap-1.5">
				Tier pricing
				<InfoTooltip side="top" className="max-w-64">
					{explanation}
				</InfoTooltip>
			</FormLabel>
			<GroupedTabButton
				value={tierBehavior}
				options={TIER_BEHAVIOR_OPTIONS}
				onValueChange={onChange}
			/>
		</div>
	);
}
