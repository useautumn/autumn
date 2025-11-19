import { Trash } from "lucide-react";
import { useState } from "react";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteCustomerDialog } from "@/views/customers/customer/components/DeleteCustomerDialog";
import type { CustomerWithProducts } from "./CustomerListColumns";

export const CustomerListRowToolbar = ({
	customer,
}: {
	customer: CustomerWithProducts;
}) => {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	return (
		<>
			<DeleteCustomerDialog
				customer={customer}
				open={deleteOpen}
				setOpen={setDeleteOpen}
			/>
			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<ToolbarButton />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					className="text-t2"
					align="end"
					onClick={(e) => e.stopPropagation()}
				>
					<DropdownMenuItem
						className="flex items-center cursor-pointer"
						onClick={(e) => {
							e.stopPropagation();
							setDeleteOpen(true);
						}}
					>
						<div className="flex items-center text-sm justify-between w-full gap-2">
							Delete
							<Trash size={12} className="text-t3" />
						</div>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};

