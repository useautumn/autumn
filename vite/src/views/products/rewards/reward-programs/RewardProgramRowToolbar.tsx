import type { RewardProgram } from "@autumn/shared";
import { SmallSpinner, ToolbarButton } from "@autumn/ui";
import { Delete } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useProductsContext } from "../../ProductsContext";

export const RewardProgramRowToolbar = ({
	rewardProgram,
}: {
	rewardProgram: RewardProgram;
}) => {
	const { refetch } = useRewardsQuery();
	const axiosInstance = useAxiosInstance();
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const handleDelete = async () => {
		setDeleteLoading(true);

		try {
			await axiosInstance.delete(`/v1/reward_programs/${rewardProgram.id}`);
			await refetch();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to delete reward trigger"));
		}

		setDeleteLoading(false);
		setDeleteOpen(false);
	};
	return (
		<DropdownMenu open={deleteOpen} onOpenChange={setDeleteOpen}>
			<DropdownMenuTrigger asChild>
				<ToolbarButton />
			</DropdownMenuTrigger>
			<DropdownMenuContent className="text-muted-foreground" align="end">
				<DropdownMenuItem
					className="flex items-center"
					onClick={async (e) => {
						e.stopPropagation();
						e.preventDefault();
						await handleDelete();
					}}
				>
					<div className="flex items-center justify-between w-full gap-2">
						Delete
						{deleteLoading ? (
							<SmallSpinner />
						) : (
							<Delete size={12} className="text-tertiary-foreground" />
						)}
					</div>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
