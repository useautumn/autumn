import type { FullCusProduct } from "@autumn/shared";
import { ArrowLeftRight, Delete } from "lucide-react";
import { useState } from "react";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCustomerContext } from "../CustomerContext";
import { useCusQuery } from "../hooks/useCusQuery";
import { TransferProductDialog } from "./TransferProductDialog";

export const CusProductToolbar = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	const { customer } = useCusQuery();
	const { showEntityView } = useCustomerContext();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [transferOpen, setTransferOpen] = useState(false);
	const setSheet = useSheetStore((s) => s.setSheet);
	return (
		<>
			<TransferProductDialog
				cusProduct={cusProduct}
				open={transferOpen}
				setOpen={setTransferOpen}
			/>
			<DropdownMenu open={dialogOpen} onOpenChange={setDialogOpen}>
				<DropdownMenuTrigger asChild>
					<ToolbarButton className="!w-4 !h-6 !rounded-md text-t3" />
				</DropdownMenuTrigger>
				<DropdownMenuContent className="text-t2 w-36" align="end">
					{(showEntityView || customer.entities.length > 0) && (
						<DropdownMenuItem
							className="flex items-center justify-between w-full text-t2"
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								setTransferOpen(true);
								setDialogOpen(false);
							}}
						>
							<p>Transfer</p>
							<ArrowLeftRight width={14} className="text-t3" />
						</DropdownMenuItem>
					)}

					<DropdownMenuItem
						className="flex items-center justify-between w-full text-t2"
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							setSheet({ type: "subscription-cancel", itemId: cusProduct.id });
							setDialogOpen(false);
						}}
					>
						<p>Cancel</p>
						<Delete width={14} className="text-t3" />
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
