import { Check, ChevronDown } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { cn } from "@/lib/utils";

export function CustomerUsageAnalyticsSelectFeatures({
	availableFeatures,
	selectedFeatures,
	setSelectedFeatures,
}: {
	availableFeatures: string[];
	selectedFeatures: string[];
	setSelectedFeatures: (features: string[]) => void;
}) {
	const toggleFeature = (feature: string) => {
		if (selectedFeatures.includes(feature)) {
			setSelectedFeatures(selectedFeatures.filter((f) => f !== feature));
		} else {
			setSelectedFeatures([...selectedFeatures, feature]);
		}
	};

	const displayText =
		selectedFeatures.length === availableFeatures.length
			? "All features"
			: selectedFeatures.length === 1
				? selectedFeatures[0]
				: `${selectedFeatures.length} features`;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="secondary"
					role="combobox"
					size="mini"
					className="justify-between font-normal !px-2 gap-3"
				>
					<span className="truncate">{displayText}</span>
					<ChevronDown className="h-4 w-4 shrink-0 text-t3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[180px] p-1" align="end">
				{availableFeatures.map((feature) => {
					const isSelected = selectedFeatures.includes(feature);
					return (
						<div
							key={feature}
							className={cn(
								"relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
								isSelected && "bg-accent/50",
							)}
							onClick={() => toggleFeature(feature)}
						>
							<Check
								className={cn(
									"mr-2 h-4 w-4",
									isSelected ? "opacity-100" : "opacity-0",
								)}
							/>
							<span>{feature}</span>
						</div>
					);
				})}
			</PopoverContent>
		</Popover>
	);
}
