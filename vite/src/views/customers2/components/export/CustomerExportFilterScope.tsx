import { Checkbox } from "@autumn/ui";
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

	return (
		<label
			htmlFor={checkboxId}
			className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40"
		>
			<Checkbox
				id={checkboxId}
				className="mt-0.5 shrink-0"
				checked={restrictToCurrentFilters}
				onCheckedChange={(checked) =>
					onRestrictToCurrentFiltersChange(checked === true)
				}
			/>
			<div className="min-w-0 space-y-1.5">
				<span className="block text-checkbox-label">
					Only export customers matching your search and filters
				</span>
				{searchText ? (
					<span className="block truncate text-tertiary-foreground text-xs">
						Search: &ldquo;{searchText}&rdquo;
					</span>
				) : null}
				{hasActiveFilters ? (
					<span className="block text-tertiary-foreground text-xs">
						Filters applied on the customers page
					</span>
				) : null}
			</div>
		</label>
	);
}
