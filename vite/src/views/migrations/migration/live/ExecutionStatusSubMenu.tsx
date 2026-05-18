import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";

const EXECUTION_STATUSES = [
	{ value: "not_run", label: "Not Run" },
	{ value: "succeeded", label: "Succeeded" },
	{ value: "skipped", label: "Skipped" },
	{ value: "failed", label: "Failed" },
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number]["value"];

export function hasActiveExecutionFilters(
	statuses: ExecutionStatus[],
): boolean {
	return statuses.length > 0;
}

export function ExecutionStatusSubMenu({
	selected,
	onChange,
}: {
	selected: ExecutionStatus[];
	onChange: (statuses: ExecutionStatus[]) => void;
}) {
	const hasSelections = selected.length > 0;

	const toggle = (status: ExecutionStatus) => {
		const isSelected = selected.includes(status);
		const updated = isSelected
			? selected.filter((s) => s !== status)
			: [...selected, status];
		onChange(updated);
	};

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
				Execution Status
				{hasSelections && (
					<span className="text-xs text-tertiary-foreground bg-muted px-1 py-0 rounded-md">
						{selected.length}
					</span>
				)}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				{EXECUTION_STATUSES.map(({ value, label }) => {
					const isActive = selected.includes(value);
					return (
						<DropdownMenuItem
							key={value}
							onClick={(e) => {
								e.preventDefault();
								toggle(value);
							}}
							onSelect={(e) => e.preventDefault()}
							className="flex items-center gap-2 cursor-pointer text-sm"
						>
							<Checkbox checked={isActive} className="border-border" />
							{label}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
