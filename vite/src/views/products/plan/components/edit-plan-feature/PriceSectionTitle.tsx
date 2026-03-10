import { TierBehavior } from "@autumn/shared";
import {
	CoinsIcon,
	DropSimpleIcon,
	RulerIcon,
	StackIcon,
} from "@phosphor-icons/react";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { cn } from "@/lib/utils";
import type { VolumePricingMode } from "../../utils/tierUtils";

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
						<IconCheckbox
							icon={<CoinsIcon />}
							iconOrientation="left"
							variant="secondary"
							size="sm"
							checked={volumePricingMode === "per_unit"}
							onCheckedChange={() => onVolumePricingModeChange("per_unit")}
							className={cn(
								"rounded-r-none",
								volumePricingMode !== "per_unit" && "border-r-0",
							)}
						>
							Per Unit
						</IconCheckbox>
						<IconCheckbox
							icon={<StackIcon />}
							iconOrientation="left"
							variant="secondary"
							size="sm"
							checked={volumePricingMode === "flat"}
							onCheckedChange={() => onVolumePricingModeChange("flat")}
							className={cn(
								"rounded-l-none",
								volumePricingMode !== "flat" && "border-l-0",
							)}
						>
							Flat Amount
						</IconCheckbox>
					</div>
				)}
				<Select value={tierBehavior} onValueChange={onTierBehaviorChange}>
					<SelectTrigger className="w-40 h-6 text-xs" size="sm">
						<SelectValue>
							{tierBehavior === TierBehavior.VolumeBased ? (
								<span className="flex items-center gap-2">
									<DropSimpleIcon className="size-3.5" weight="regular" />
									Volume-based
								</span>
							) : (
								<span className="flex items-center gap-2">
									<RulerIcon className="size-3.5" weight="regular" />
									Graduated
								</span>
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
