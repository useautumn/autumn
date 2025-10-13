import type { ProductV2 } from "@autumn/shared";
import { Archive, ArchiveRestore, Copy, Pen } from "lucide-react";
import { useState } from "react";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CopyProductDialog } from "../components/CopyProductDialog";
import { DeleteProductDialog } from "../components/DeleteProductDialog";
import { UpdateProductDialog } from "../components/UpdateProductDialog";

export const ProductRowToolbar = ({
	className,
	isOnboarding = false,
	product,
}: {
	isOnboarding?: boolean;
	className?: string;
	product: ProductV2;
}) => {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [updateOpen, setUpdateOpen] = useState(false);
	const [copyOpen, setCopyOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	let deleteText = "Archive";
	let DeleteIcon = Archive;

	if (product.archived) {
		deleteText = "Unarchive";
		DeleteIcon = ArchiveRestore;
	}

	return (
		<>
			<UpdateProductDialog
				open={updateOpen}
				setOpen={setUpdateOpen}
				selectedProduct={product}
			/>
			<CopyProductDialog
				open={copyOpen}
				setOpen={setCopyOpen}
				product={product}
			/>
			<DeleteProductDialog
				product={product}
				open={deleteOpen}
				setOpen={setDeleteOpen}
			/>

			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<ToolbarButton />
				</DropdownMenuTrigger>
				<DropdownMenuContent className="text-t2" align="end">
					{!isOnboarding && (
						<DropdownMenuItem
							className="flex items-center text-xs"
							onClick={(e) => {
								e.stopPropagation();
								e.preventDefault();
								setDropdownOpen(false);
								setCopyOpen(true);
							}}
						>
							<div className="flex items-center justify-between w-full gap-2">
								Copy
								<Copy size={12} className="text-t3" />
							</div>
						</DropdownMenuItem>
					)}
					{!isOnboarding && (
						<DropdownMenuItem
							className="flex items-center text-xs"
							onClick={(e) => {
								e.stopPropagation();
								e.preventDefault();
								setDropdownOpen(false);
								setUpdateOpen(true);
							}}
						>
							<div className="flex items-center justify-between w-full gap-2">
								Edit
								<Pen size={12} className="text-t3" />
							</div>
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						className="flex items-center text-xs"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							setDropdownOpen(false);
							setDeleteOpen(true);
						}}
					>
						<div className="flex items-center justify-between w-full gap-2">
							{deleteText}
							<DeleteIcon size={12} className="text-t3" />
						</div>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
