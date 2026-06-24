import { Checkbox } from "@autumn/ui";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@autumn/ui";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { useCustomerFilters } from "../../hooks/useCustomerFilters";

export const FilterStatusSubMenu = ({
	onChange,
}: {
	onChange?: () => void;
}) => {
	const { queryStates, setFilters } = useCustomerFilters();

	const statuses: string[] = [
		"active",
		"past_due",
		"canceled",
		"free_trial",
		"expired",
	];
	const selectedStatuses = queryStates.status || [];
	const hasSelections = selectedStatuses.length > 0;

	const toggleStatus = (status: string) => {
		const selected = queryStates.status || [];
		const isSelected = selected.includes(status);

		const updated = isSelected
			? selected.filter((s: string) => s !== status)
			: [...selected, status];

		setFilters({ status: updated });
		onChange?.();
	};

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
				Status
				{hasSelections && (
					<span className="text-xs text-tertiary-foreground bg-muted px-1 py-0 rounded-md">
						{selectedStatuses.length}
					</span>
				)}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				{statuses.map((status: any) => {
					const isActive = selectedStatuses.includes(status);
					return (
						<DropdownMenuItem
							key={status}
							closeOnClick={false}
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								toggleStatus(status);
							}}
							className="flex items-center gap-2 cursor-pointer text-sm"
						>
							<Checkbox checked={isActive} className="border-border" />
							{keyToTitle(status)}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
};
