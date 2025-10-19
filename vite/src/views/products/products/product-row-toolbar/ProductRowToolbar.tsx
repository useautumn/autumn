import type { ProductCounts, ProductV2 } from "@autumn/shared";
import { Archive, ArchiveRestore, Copy, Delete, Pen } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeletePlanDialog } from "../../plan/components/DeletePlanDialog";
import { CopyProductDialog } from "../components/CopyProductDialog";
import { UpdateProductDialog } from "../components/UpdateProductDialog";

export const ProductRowToolbar = ({
	className,
	isOnboarding = false,
	product,
	productCounts,
}: {
	isOnboarding?: boolean;
	className?: string;
	product: ProductV2;
	productCounts: ProductCounts | undefined;
}) => {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [updateOpen, setUpdateOpen] = useState(false);
	const [copyOpen, setCopyOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const navigate = useNavigate();

	const allCount = productCounts?.all || 0;
	let deleteText = allCount > 0 ? "Archive" : "Delete";
	let DeleteIcon = allCount > 0 ? Archive : Delete;

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
			<DeletePlanDialog
				propProduct={product}
				open={deleteOpen}
				setOpen={setDeleteOpen}
				// onDeleteSuccess={async () => {
				// 	pushPage({
				// 		navigate,
				// 		path: "/products",
				// 		queryParams: {
				// 			tab: "products",
				// 		},
				// 		preserveParams: true,
				// 	});
				// }}
			/>
			{/* <DeleteProductDialog
				product={product}
				open={deleteOpen}
				setOpen={setDeleteOpen}

				// productCounts={productCounts}
				// dropdownOpen={dropdownOpen}
			/> */}

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
