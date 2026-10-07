import type { Feature } from "@autumn/shared";
import {
	Button,
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** An empty selection means every feature. */
export function FeatureSelectDropdown({
	features,
	selectedFeatureIds,
	onChange,
}: {
	features: Feature[];
	selectedFeatureIds: string[];
	onChange: ({ featureIds }: { featureIds: string[] }) => void;
}) {
	const isAllSelected = selectedFeatureIds.length === 0;
	const selectedIds = new Set(selectedFeatureIds);
	const [open, setOpen] = useState(false);

	const label = isAllSelected
		? "All Features"
		: `${selectedFeatureIds.length} feature${selectedFeatureIds.length !== 1 ? "s" : ""} selected`;

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger
				render={
					<Button
						variant="secondary"
						size="mini"
						className={cn(
							"gap-1 w-full justify-between",
							open && "btn-secondary-active",
						)}
					/>
				}
			>
				{label}
				<CaretDownIcon className="size-3.5 text-tertiary-foreground" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-(--anchor-width)">
				<DropdownMenuCheckboxItem
					checked={isAllSelected}
					onCheckedChange={() => onChange({ featureIds: [] })}
				>
					All Features
				</DropdownMenuCheckboxItem>
				{features.length > 0 && <DropdownMenuSeparator />}
				{features.map((feature) => {
					const isChecked = selectedIds.has(feature.id);
					return (
						<DropdownMenuCheckboxItem
							key={feature.id}
							checked={isChecked}
							onCheckedChange={(checked) => {
								const newIds = checked
									? [...selectedFeatureIds, feature.id]
									: selectedFeatureIds.filter((id) => id !== feature.id);
								onChange({ featureIds: newIds });
							}}
						>
							{feature.name}
						</DropdownMenuCheckboxItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
