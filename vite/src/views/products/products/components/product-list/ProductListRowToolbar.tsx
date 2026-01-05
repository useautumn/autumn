import { AppEnv, type ProductV2 } from "@autumn/shared";
import {
	ArchiveIcon,
	ArrowCounterClockwiseIcon,
	CopyIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { DeletePlanDialog } from "@/views/products/plan/components/DeletePlanDialog";
import { CopyProductDialog } from "../CopyProductDialog";

export const ProductListRowToolbar = ({ product }: { product: ProductV2 }) => {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [copyOpen, setCopyOpen] = useState(false);
	const [copyToEnv, setCopyToEnv] = useState<AppEnv>(AppEnv.Sandbox);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const { counts } = useProductsQuery();

	const productCounts = counts[product.id];
	const allCount = productCounts?.all || 0;
	let deleteText = allCount > 0 ? "Archive" : "Delete";
	let DeleteIcon = allCount > 0 ? ArchiveIcon : TrashIcon;

	if (product.archived) {
		deleteText = "Unarchive";
		DeleteIcon = ArrowCounterClockwiseIcon;
	}

	return (
		<>
			<CopyProductDialog
				open={copyOpen}
				setOpen={setCopyOpen}
				product={product}
				targetEnv={copyToEnv}
			/>
			<DeletePlanDialog
				propProduct={product}
				open={deleteOpen}
				setOpen={setDeleteOpen}
				dropdownOpen={dropdownOpen}
			/>

			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<ToolbarButton />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuSub>
						<DropdownMenuSubTrigger className="flex gap-2">
							<CopyIcon />
							Copy to
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem
								className="flex gap-2"
								onClick={(e) => {
									e.stopPropagation();
									e.preventDefault();
									setDropdownOpen(false);
									setCopyToEnv(AppEnv.Sandbox);
									setCopyOpen(true);
								}}
							>
								Sandbox
							</DropdownMenuItem>
							<DropdownMenuItem
								className="flex gap-2"
								onClick={(e) => {
									e.stopPropagation();
									e.preventDefault();
									setDropdownOpen(false);
									setCopyToEnv(AppEnv.Live);
									setCopyOpen(true);
								}}
							>
								Production
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuItem
						className="flex gap-2"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							setDropdownOpen(false);
							setDeleteOpen(true);
						}}
					>
						<DeleteIcon />
						{deleteText}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
