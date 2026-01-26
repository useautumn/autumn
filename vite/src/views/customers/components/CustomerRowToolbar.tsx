import type { Customer } from "@autumn/shared";
import { Delete, Trash } from "lucide-react";
import { useState } from "react";
import SmallSpinner from "@/components/general/SmallSpinner";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { ContextMenuItem } from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const CustomerRowToolbarItems = ({
	setDeleteOpen,
	isContextMenu = false,
}: {
	setDeleteOpen: (open: boolean) => void;
	isContextMenu?: boolean;
}) => {
	const MenuItem = isContextMenu ? ContextMenuItem : DropdownMenuItem;

	return (
		<>
			<MenuItem
				className="flex items-center"
				onClick={async (e) => {
					setDeleteOpen(true);
				}}
			>
				<div className="flex items-center text-sm justify-between w-full gap-2">
					Delete
					<Delete size={12} className="text-t3" />
				</div>
			</MenuItem>
		</>
	);
};

export const CustomerRowToolbar = ({
	customer,
	setDeleteOpen,
}: {
	customer: Customer;
	setDeleteOpen: (open: boolean) => void;
}) => {
	const [dropdownOpen, setDropdownOpen] = useState(false);

	return (
		<>
			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<ToolbarButton />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					className="text-t2"
					align="end"
					onClick={(e) => e.stopPropagation()}
				>
					<CustomerRowToolbarItems
						setDeleteOpen={setDeleteOpen}
						isContextMenu={false}
					/>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
