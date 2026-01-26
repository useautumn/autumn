import type { Reward } from "@autumn/shared";
import { Delete } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import SmallSpinner from "@/components/general/SmallSpinner";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { RewardService } from "@/services/products/RewardService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const RewardRowToolbar = ({ reward }: { reward: Reward }) => {
	const { refetch } = useRewardsQuery();
	const axiosInstance = useAxiosInstance();
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const handleDelete = async () => {
		setDeleteLoading(true);

		try {
			await RewardService.deleteReward({
				axiosInstance,
				internalId: reward.internal_id,
			});
			await refetch();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to delete coupon"));
		}

		setDeleteLoading(false);
		setDeleteOpen(false);
	};
	return (
		<DropdownMenu open={deleteOpen} onOpenChange={setDeleteOpen}>
			<DropdownMenuTrigger asChild>
				<ToolbarButton />
			</DropdownMenuTrigger>
			<DropdownMenuContent className="text-t2" align="end">
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
							<Delete size={12} className="text-t3" />
						)}
					</div>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
