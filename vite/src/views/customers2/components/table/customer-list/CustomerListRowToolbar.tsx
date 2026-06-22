import { ToolbarButton } from "@autumn/ui";
import { Trash } from "lucide-react";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
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
				<div
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
					onMouseDown={(e) => {
						e.preventDefault();
						e.stopPropagation();
					}}
				>
					<DropdownMenuTrigger asChild>
						<ToolbarButton />
					</DropdownMenuTrigger>
				</div>
				<DropdownMenuContent
					className="text-muted-foreground"
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
							<Trash size={12} className="text-tertiary-foreground" />
						</div>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
