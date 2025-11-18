import type { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import {
	Sheet,
	SheetContent,
	SheetTrigger,
} from "@/components/v2/sheets/Sheet";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useRewardStore } from "@/hooks/stores/useRewardStore";
import { RewardService } from "@/services/products/RewardService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { mapFrontendToApiReward } from "../../utils/rewardMappers";
import { DiscountRewardConfig } from "./DiscountRewardConfig";
import { FreeProductRewardConfig } from "./FreeProductRewardConfig";
import { RewardDetails } from "./RewardDetails";
import { SelectRewardType } from "./SelectRewardType";

interface CreateRewardSheetProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

export function CreateRewardSheet({
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
}: CreateRewardSheetProps = {}) {
	const axiosInstance = useAxiosInstance();
	const { refetch } = useRewardsQuery();

	const [loading, setLoading] = useState(false);
	const [internalOpen, setInternalOpen] = useState(false);

	// Use controlled state if provided, otherwise use internal state
	const open = controlledOpen ?? internalOpen;
	const setOpen = controlledOnOpenChange ?? setInternalOpen;

	const reward = useRewardStore((s) => s.reward);
	const setReward = useRewardStore((s) => s.setReward);
	const reset = useRewardStore((s) => s.reset);

	// Reset state when sheet opens
	useEffect(() => {
		if (open) {
			reset();
		}
	}, [open, reset]);

	const handleCreate = async () => {
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
			toast.error("Please select a free plan");
			return;
		}

		setLoading(true);
		try {
			const apiReward = mapFrontendToApiReward(reward);

			await RewardService.createReward({
				axiosInstance,
				data: apiReward,
			});

			await refetch();
			toast.success("Reward created successfully");
			setOpen(false);
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to create reward"),
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
			<SheetTrigger asChild>
				<Button variant="primary" size="default">
					Create Reward
				</Button>
			</SheetTrigger>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title="Create Reward"
					description="Create a discount or free plan reward"
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
						onClick={handleCreate}
						metaShortcut="enter"
						isLoading={loading}
					>
						Create reward
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
