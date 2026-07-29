import {
	Checkbox,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@autumn/ui";

export type FilterRadioOption<T> = { value: T; label: string };

/**
 * Single-select filter sub-menu: a labelled trigger (with an optional active
 * badge) over a list of exclusive choices. Mirrors FilterCheckboxSubMenu's
 * styling but for one-of-N filters (e.g. status: Active / Show archived).
 */
export function FilterRadioSubMenu<T extends string | boolean>({
	label,
	options,
	value,
	onChange,
	activeBadge,
}: {
	label: string;
	options: FilterRadioOption<T>[];
	value: T;
	onChange: (value: T) => void;
	/** Shown next to the trigger label when a non-default filter is active. */
	activeBadge?: string;
}) {
	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
				{label}
				{activeBadge && (
					<span className="text-xs text-tertiary-foreground bg-muted px-1 py-0 rounded-md">
						{activeBadge}
					</span>
				)}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				{options.map((option) => (
					<DropdownMenuItem
						key={String(option.value)}
						closeOnClick={false}
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onChange(option.value);
						}}
						className="flex items-center gap-2 cursor-pointer text-sm"
					>
						<Checkbox
							checked={value === option.value}
							className="border-border"
						/>
						{option.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
