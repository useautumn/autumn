import type { Reward } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useRewardStore } from "@/hooks/stores/useRewardStore";
import { RewardService } from "@/services/products/RewardService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	mapApiToFrontendReward,
	mapFrontendToApiReward,
} from "../../utils/rewardMappers";
import { DiscountRewardConfig } from "./DiscountRewardConfig";
import { FreeProductRewardConfig } from "./FreeProductRewardConfig";
import { RewardDetails } from "./RewardDetails";
import { SelectRewardType } from "./SelectRewardType";

interface UpdateRewardSheetProps {
	open: boolean;
	setOpen: (open: boolean) => void;
	selectedReward: Reward | null;
}

export function UpdateRewardSheet({
	open,
	setOpen,
	selectedReward,
}: UpdateRewardSheetProps) {
	const axiosInstance = useAxiosInstance();
	const { refetch } = useRewardsQuery();

	const [loading, setLoading] = useState(false);

	const reward = useRewardStore((s) => s.reward);
	const setReward = useRewardStore((s) => s.setReward);
	const setBaseReward = useRewardStore((s) => s.setBaseReward);

	// Initialize reward store when selectedReward changes
	useEffect(() => {
		if (open && selectedReward) {
			const frontendReward = mapApiToFrontendReward(selectedReward);

			setReward(frontendReward);
			setBaseReward(frontendReward);
		}
	}, [open, selectedReward, setReward, setBaseReward]);

	const handleUpdate = async () => {
		if (!selectedReward) return;

		// Validation
		if (!reward.name || !reward.id) {
			toast.error("Name and ID are required");
			return;
		}

		if (!reward.rewardCategory) {
			toast.error("Please select a reward type");
			return;
		}

		if (reward.rewardCategory === "discount") {
			if (!reward.discountType) {
				toast.error("Please select a discount type");
				return;
			}

			const config = reward.discount_config;
			if (
				!config?.apply_to_all &&
				(!config?.price_ids || config.price_ids.length === 0)
			) {
				toast.error("Please select price(s) to apply this reward to");
				return;
			}
		}

		if (reward.rewardCategory === "free_product" && !reward.free_product_id) {
			toast.error("Please select a free product");
			return;
		}

		setLoading(true);
		try {
			const apiReward = mapFrontendToApiReward(reward);

			await RewardService.updateReward({
				axiosInstance,
				internalId: selectedReward.id,
				data: apiReward,
			});

			await refetch();
			toast.success("Reward updated successfully");
			setOpen(false);
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to update reward"),
			);
		} finally {
			setLoading(false);
		}
	};

	const handleCancel = () => {
		setOpen(false);
	};

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title="Update Reward"
					description="Modify your discount or free product reward"
				/>

				<div className="flex-1 overflow-y-auto">
					<RewardDetails reward={reward} setReward={setReward} />
					<SelectRewardType reward={reward} setReward={setReward} />

					{reward.rewardCategory === "discount" && (
						<DiscountRewardConfig reward={reward} setReward={setReward} />
					)}

					{reward.rewardCategory === "free_product" && (
						<FreeProductRewardConfig reward={reward} setReward={setReward} />
					)}
				</div>

				<SheetFooter>
					<ShortcutButton
						variant="secondary"
						className="w-full"
						onClick={handleCancel}
						singleShortcut="escape"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton
						className="w-full"
						onClick={handleUpdate}
						metaShortcut="enter"
						isLoading={loading}
					>
						Update reward
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
