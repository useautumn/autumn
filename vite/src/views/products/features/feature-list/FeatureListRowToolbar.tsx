import { type Feature, FeatureType } from "@autumn/shared";
import { ArchiveRestore, Delete, Pen } from "lucide-react";
import { useState } from "react";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import UpdateFeatureSheet from "../components/UpdateFeatureSheet";
import UpdateCreditSystemSheet from "../credit-systems/components/UpdateCreditSystemSheet";
import { DeleteFeatureDialog } from "../feature-row-toolbar/DeleteFeatureDialog";

export const FeatureListRowToolbar = ({ feature }: { feature: Feature }) => {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [updateOpen, setUpdateOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const isCreditSystem = feature.type === FeatureType.CreditSystem;

	const deleteText = feature.archived ? "Unarchive" : "Delete";
	const DeleteIcon = feature.archived ? ArchiveRestore : Delete;

	return (
		<>
			{isCreditSystem ? (
				<UpdateCreditSystemSheet
					open={updateOpen}
					setOpen={setUpdateOpen}
					selectedCreditSystem={feature}
				/>
			) : (
				<UpdateFeatureSheet
					open={updateOpen}
					setOpen={setUpdateOpen}
					selectedFeature={feature}
				/>
			)}
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
				<DropdownMenuContent className="text-t2" align="end">
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
