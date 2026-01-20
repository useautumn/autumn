import type { Reward } from "@autumn/shared";
import { RewardType } from "@autumn/shared";
import { ArrowSquareOut, Trash } from "@phosphor-icons/react";
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
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { RewardService } from "@/services/products/RewardService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { getStripeCouponLink } from "@/utils/linkUtils";

export const RewardRowToolbar = ({ reward }: { reward: Reward }) => {
	const { refetch } = useRewardsQuery();
	const { stripeAccount } = useOrgStripeQuery();
	const axiosInstance = useAxiosInstance();
	const env = useEnv();
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [dropdownOpen, setDropdownOpen] = useState(false);

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
		setDropdownOpen(false);
	};

	const handleOpenInStripe = () => {
		if (!reward.id) return;
		window.open(
			getStripeCouponLink({
				couponId: reward.id,
				env,
				accountId: stripeAccount?.id,
			}),
			"_blank",
		);
	};

	const isDiscountReward = reward.type !== RewardType.FreeProduct;

	return (
		<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
			<DropdownMenuTrigger asChild>
				<ToolbarButton />
			</DropdownMenuTrigger>
			<DropdownMenuContent className="text-t2" align="end">
				{isDiscountReward && reward.id && (
					<DropdownMenuItem
						className="flex items-center"
						onClick={(e) => {
							e.stopPropagation();
							handleOpenInStripe();
						}}
					>
						<div className="flex items-center justify-between w-full gap-2">
							Open in Stripe
							<ArrowSquareOut size={12} className="text-t3" />
						</div>
					</DropdownMenuItem>
				)}
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
							<Trash size={12} className="text-t3" />
						)}
					</div>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
