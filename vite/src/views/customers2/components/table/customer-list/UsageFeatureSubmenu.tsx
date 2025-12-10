import { type Feature, FeatureType } from "@autumn/shared";
import { useMemo } from "react";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";

interface UsageFeatureSubmenuProps {
	features: Feature[];
	selectedUsageFeatureIds: string[];
	onToggleUsageFeature: (featureId: string) => void;
}

/**
 * Submenu for selecting metered feature usage columns.
 * Designed to be rendered inside the TableColumnVisibility dropdown via columnVisibilityExtras.
 */
export function UsageFeatureSubmenu({
	features,
	selectedUsageFeatureIds,
	onToggleUsageFeature,
}: UsageFeatureSubmenuProps) {
	// Filter to only metered features (non-boolean)
	const meteredFeatures = useMemo(
		() =>
			features.filter(
				(f) =>
					f.type === FeatureType.Metered || f.type === FeatureType.CreditSystem,
			),
		[features],
	);

	const hasSelectedUsageFeatures = selectedUsageFeatureIds.length > 0;

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer text-sm">
				Usage
				{hasSelectedUsageFeatures && (
					<span className="text-xs text-t3 bg-muted px-1 py-0 rounded-md">
						{selectedUsageFeatureIds.length}
					</span>
				)}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="min-w-[200px]">
				{meteredFeatures.length === 0 ? (
					<div className="px-2 py-3 text-center text-t3 text-sm">
						No metered features found
					</div>
				) : (
					<div className="max-h-64 overflow-y-auto">
						{meteredFeatures.map((feature) => {
							const isSelected = selectedUsageFeatureIds.includes(feature.id);

							return (
								<DropdownMenuItem
									key={feature.id}
									onClick={(e) => {
										e.preventDefault();
										onToggleUsageFeature(feature.id);
									}}
									onSelect={(e) => e.preventDefault()}
									className="flex items-center gap-2 cursor-pointer text-sm"
								>
									<Checkbox checked={isSelected} className="border-border" />
									{feature.name}
								</DropdownMenuItem>
							);
						})}
					</div>
				)}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
