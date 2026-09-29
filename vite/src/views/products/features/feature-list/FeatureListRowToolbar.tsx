import type { Feature } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	ToolbarButton,
} from "@autumn/ui";
import { ArchiveRestore, Delete, Pen } from "lucide-react";
import { useState } from "react";
import { useProductsQueryState } from "@/views/products/hooks/useProductsQueryState";
import { DeleteFeatureDialog } from "../feature-row-toolbar/DeleteFeatureDialog";

export const FeatureListRowToolbar = ({ feature }: { feature: Feature }) => {
	const { setQueryStates } = useProductsQueryState();
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const deleteText = feature.archived ? "Unarchive" : "Delete";
	const DeleteIcon = feature.archived ? ArchiveRestore : Delete;

	return (
		<>
			<DeleteFeatureDialog
				feature={feature}
				open={deleteOpen}
				setOpen={setDeleteOpen}
				dropdownOpen={dropdownOpen}
			/>

			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<ToolbarButton />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						className="flex items-center text-xs"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							setDropdownOpen(false);
							setQueryStates({ feature: feature.id });
						}}
					>
						<div className="flex items-center justify-between w-full gap-2">
							Edit
							<Pen size={12} className="text-tertiary-foreground" />
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
							{deleteText}
							<DeleteIcon size={12} className="text-tertiary-foreground" />
						</div>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
