import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import { Copy, EllipsisVerticalIcon, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { cn } from "@/lib/utils";
import { pushPage } from "@/utils/genUtils";
import { CopyProductDialog } from "../../products/components/CopyProductDialog";
import { DeletePlanDialog } from "./DeletePlanDialog";

export const PlanToolbar = () => {
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [copyOpen, setCopyOpen] = useState(false);
	const navigate = useNavigate();
	const product = useProductStore((s) => s.product);
	const [dropdownOpen, setDropdownOpen] = useState(false);

	return (
		<>
			<CopyProductDialog
				open={copyOpen}
				setOpen={setCopyOpen}
				product={product}
			/>
			<DeletePlanDialog
				open={deleteOpen}
				setOpen={setDeleteOpen}
				onDeleteSuccess={async () => {
					pushPage({
						navigate,
						path: "/products",
						queryParams: {
							tab: "products",
						},
						preserveParams: true,
					});
				}}
			/>
			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<IconButton
						icon={<EllipsisVerticalIcon />}
						variant="secondary"
						iconOrientation="center"
						className={cn("!h-6", dropdownOpen && "btn-secondary-active")}
					/>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
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
							<Copy size={12} className="text-tertiary-foreground" />
						</div>
					</DropdownMenuItem>
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
							Delete Plan
							<Trash2 size={12} className="text-tertiary-foreground" />
						</div>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
