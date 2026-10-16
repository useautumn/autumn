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
import { APPROVAL_OPENERS } from "@/components/forms/shared/permission/approvalOpeners";
import { useCanDo } from "@/hooks/queries/useCanDo";
import { useProductsQueryState } from "@/views/products/hooks/useProductsQueryState";
import { DeleteFeatureDialog } from "../feature-row-toolbar/DeleteFeatureDialog";

export const FeatureListRowToolbar = ({ feature }: { feature: Feature }) => {
	const { setQueryStates } = useProductsQueryState();
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const canEdit = useCanDo(APPROVAL_OPENERS.updateFeature);
	const canDelete = useCanDo(
		feature.archived
			? APPROVAL_OPENERS.updateFeature
			: APPROVAL_OPENERS.deleteFeature,
	);
	if (!canEdit && !canDelete) return null;

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
					{canEdit && (
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
					)}
					{canDelete && (
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
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
