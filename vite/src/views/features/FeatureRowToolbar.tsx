import type { Feature } from "@autumn/shared";
import { ArchiveRestore, Delete } from "lucide-react";
import { useState } from "react";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteFeatureDialog } from "./components/DeleteFeatureDialog";

export const FeatureRowToolbar = ({
	className,
	feature,
}: {
	className?: string;
	feature: Feature;
}) => {
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [dropdownOpen, setDropdownOpen] = useState(false);

	return (
		<>
			<DeleteFeatureDialog
				feature={feature}
				open={deleteDialogOpen}
				setOpen={setDeleteDialogOpen}
			/>
			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<ToolbarButton className="!h-5 !w-5" />
				</DropdownMenuTrigger>
				<DropdownMenuContent className="text-t2" align="end">
					<DropdownMenuItem
						className="flex items-center"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							setDeleteDialogOpen(true);
							setDropdownOpen(false);
						}}
					>
						<div className="flex items-center justify-between w-full gap-2">
							{feature.archived ? "Unarchive" : "Delete"}
							{feature.archived ? (
								<ArchiveRestore size={12} />
							) : (
								<Delete size={12} />
							)}
						</div>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
