import { TierBehavior } from "@autumn/shared";
import {
	IconCheckbox,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import {
	CoinsIcon,
	DropSimpleIcon,
	RulerIcon,
	StackIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { VolumePricingMode } from "../../utils/tierUtils";

const VOLUME_PRICING_MODES: { mode: VolumePricingMode; label: string }[] = [
	{ mode: "per_unit", label: "Per Unit" },
	{ mode: "flat", label: "Flat" },
	{ mode: "per_unit_and_flat", label: "Unit + Flat" },
];

export function PriceSectionTitle({
	tierBehavior,
	volumePricingMode,
	showVolumePricingToggle,
	onTierBehaviorChange,
	onVolumePricingModeChange,
}: {
	tierBehavior: TierBehavior;
	volumePricingMode: VolumePricingMode;
	showVolumePricingToggle: boolean;
	onTierBehaviorChange: (val: string) => void;
	onVolumePricingModeChange: (mode: VolumePricingMode) => void;
}) {
	return (
		<div className="flex items-center justify-between w-full">
			<span>Price</span>
			<div className="flex items-center gap-2">
				{showVolumePricingToggle && (
					<div className="flex items-center">
						{VOLUME_PRICING_MODES.map(({ mode, label }, index) => {
							const isChecked = volumePricingMode === mode;
							const isFirst = index === 0;
							const isLast = index === VOLUME_PRICING_MODES.length - 1;
							const nextIsChecked =
								VOLUME_PRICING_MODES[index + 1]?.mode === volumePricingMode;
							return (
								<IconCheckbox
									key={mode}
									variant="secondary"
									size="sm"
									checked={isChecked}
									onCheckedChange={() => onVolumePricingModeChange(mode)}
									className={cn(
										"w-fit",
										!isFirst && "rounded-l-none",
										!isLast && "rounded-r-none",
										!isChecked && !isFirst && "border-l-0",
										!isChecked && nextIsChecked && "border-r-0",
									)}
								>
									{label}
								</IconCheckbox>
							);
						})}
					</div>
				)}
				<Select
					value={tierBehavior}
					onValueChange={onTierBehaviorChange}
					items={{
						[TierBehavior.Graduated]: "Graduated",
						[TierBehavior.VolumeBased]: "Volume-based",
					}}
				>
					<SelectTrigger className="w-32 h-6 text-xs!" size="sm">
						<SelectValue>
							{tierBehavior === TierBehavior.VolumeBased ? (
								<span className="flex items-center gap-2">Volume-based</span>
							) : (
								<span className="flex items-center gap-2">Graduated</span>
							)}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={TierBehavior.Graduated}>
							<RulerIcon className="size-4" weight="regular" />
							Graduated
						</SelectItem>
						<SelectItem value={TierBehavior.VolumeBased}>
							<DropSimpleIcon className="size-4" weight="regular" />
							Volume-based
						</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
