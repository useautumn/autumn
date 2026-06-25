import { Checkbox } from "@autumn/ui";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@autumn/ui";
import type { ReactNode } from "react";

export type FilterCheckboxOption = {
	value: string;
	label: string;
	icon?: ReactNode;
};

export const FilterCheckboxSubMenu = ({
	label,
	options,
	selected,
	onToggle,
}: {
	label: string;
	options: FilterCheckboxOption[];
	selected: string[];
	onToggle: (value: string) => void;
}) => (
	<DropdownMenuSub>
		<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
			{label}
			{selected.length > 0 && (
				<span className="text-xs text-tertiary-foreground bg-muted px-1 py-0 rounded-md">
					{selected.length}
				</span>
			)}
		</DropdownMenuSubTrigger>
		<DropdownMenuSubContent>
			{options.map(({ value, label: optionLabel, icon }) => (
				<DropdownMenuItem
					key={value}
					closeOnClick={false}
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onToggle(value);
					}}
					className="flex items-center gap-2 cursor-pointer text-sm"
				>
					<Checkbox checked={selected.includes(value)} className="border-border" />
					{icon}
					{optionLabel}
				</DropdownMenuItem>
			))}
		</DropdownMenuSubContent>
	</DropdownMenuSub>
);

export const toggleFilterValue = (selected: string[], value: string) =>
	selected.includes(value)
		? selected.filter((v) => v !== value)
		: [...selected, value];
