import type { Feature } from "@autumn/shared";
import { Delete } from "lucide-react";
import { useState } from "react";
import SmallSpinner from "@/components/general/SmallSpinner";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { DeleteFeatureDialog } from "../features/components/DeleteFeatureDialog";
import { useFeaturesContext } from "../features/FeaturesContext";

export const CreditSystemRowToolbar = ({
	creditSystem,
}: {
	creditSystem: Feature;
}) => {
	const { env, mutate } = useFeaturesContext();
	const _axiosInstance = useAxiosInstance({ env });
	const [deleteLoading, _setDeleteLoading] = useState(false);
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	// const handleDelete = async () => {
	//   setDeleteLoading(true);

	//   try {
	//     await FeatureService.deleteFeature(axiosInstance, creditSystem.id);
	//     await mutate();
	//   } catch (error) {
	//     toast.error(getBackendErr(error, "Failed to delete feature"));
	//   }

	//   setDeleteLoading(false);
	//   setDeleteOpen(false);
	// };
	return (
		<>
			<DeleteFeatureDialog
				feature={creditSystem}
				open={deleteDialogOpen}
				setOpen={setDeleteDialogOpen}
			/>

			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<ToolbarButton />
				</DropdownMenuTrigger>
				<DropdownMenuContent className="text-t2" align="end">
					<DropdownMenuItem
						className="flex items-center"
						onClick={async (e) => {
							e.stopPropagation();
							e.preventDefault();
							setDeleteDialogOpen(true);
							setDropdownOpen(false);
						}}
					>
						<div className="flex items-center justify-between w-full gap-2">
							Delete
							{deleteLoading ? (
								<SmallSpinner />
							) : (
								<Delete size={14} className="text-t3" />
							)}
						</div>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
