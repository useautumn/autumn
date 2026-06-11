import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";

export const EXECUTION_STATUS_VALUES = [
	"queued",
	"running",
	"not_run",
	"succeeded",
	"skipped",
	"failed",
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUS_VALUES)[number];

const EXECUTION_STATUS_LABELS: Record<ExecutionStatus, string> = {
	queued: "Queued",
	running: "Running",
	not_run: "Not Run",
	succeeded: "Succeeded",
	skipped: "Skipped",
	failed: "Failed",
};

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
				{EXECUTION_STATUS_VALUES.map((status) => {
					const isActive = selected.includes(status);
					return (
						<DropdownMenuItem
							key={status}
							onClick={(e) => {
								e.preventDefault();
								toggle(status);
							}}
							onSelect={(e) => e.preventDefault()}
							className="flex items-center gap-2 cursor-pointer text-sm"
						>
							<Checkbox checked={isActive} className="border-border" />
							{EXECUTION_STATUS_LABELS[status]}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
