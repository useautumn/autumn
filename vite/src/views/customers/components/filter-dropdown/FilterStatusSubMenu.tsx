import {
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuItem,
} from "@/components/v2/dropdowns/DropdownMenu";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { useCustomersQueryStates } from "../../hooks/useCustomersQueryStates";

export const FilterStatusSubMenu = () => {
	const { queryStates, setQueryStates } = useCustomersQueryStates();

	const statuses: string[] = ["canceled", "free_trial", "expired"];
	const selectedStatuses = queryStates.status || [];
	const hasSelections = selectedStatuses.length > 0;

	const toggleStatus = (status: string) => {
		const selected = queryStates.status || [];
		const isSelected = selected.includes(status);

		const updated = isSelected
			? selected.filter((s: string) => s !== status)
			: [...selected, status];

		setQueryStates({ ...queryStates, status: updated });
	};

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
				Status
				{hasSelections && (
					<span className="text-xs text-t3 bg-muted px-1 py-0 rounded-md">
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
							onClick={(e) => {
								e.preventDefault();
								toggleStatus(status);
							}}
							onSelect={(e) => e.preventDefault()}
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
