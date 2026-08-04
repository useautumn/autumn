import { Checkbox, ConditionalTooltip } from "@autumn/ui";
import { useId } from "react";

export function CustomerExportFilterScope({
	searchText,
	hasActiveFilters,
	restrictToCurrentFilters,
	onRestrictToCurrentFiltersChange,
}: {
	searchText: string;
	hasActiveFilters: boolean;
	restrictToCurrentFilters: boolean;
	onRestrictToCurrentFiltersChange: (restrict: boolean) => void;
}) {
	const checkboxId = useId();

	const tooltipLines = [
		searchText ? `Search: “${searchText}”` : null,
		hasActiveFilters ? "Filters applied on the customers page" : null,
	].filter(Boolean);

	return (
		<ConditionalTooltip
			enabled={tooltipLines.length > 0}
			content={tooltipLines.join(" · ")}
		>
			<label
				htmlFor={checkboxId}
				className="flex cursor-pointer items-center gap-2 text-tertiary-foreground text-xs"
			>
				<Checkbox
					id={checkboxId}
					checked={restrictToCurrentFilters}
					onCheckedChange={(checked) =>
						onRestrictToCurrentFiltersChange(checked === true)
					}
				/>
				Apply filters
			</label>
		</ConditionalTooltip>
	);
}
