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
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useRewardStore } from "@/hooks/stores/useRewardStore";
import { RewardService } from "@/services/products/RewardService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { mapFrontendToApiReward } from "../../utils/rewardMappers";
import { DiscountRewardConfig } from "./DiscountRewardConfig";
import { FeatureGrantRewardConfig } from "./FeatureGrantRewardConfig";
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
	const { features } = useFeaturesQuery();

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

	const isFormValid = () => {
		if (!reward.name || !reward.id) return false;
		if (!reward.rewardCategory) return false;

		if (reward.rewardCategory === "discount") {
			if (!reward.discountType) return false;
			const config = reward.discount_config;
			if (
				!config?.apply_to_all &&
				(!config?.price_ids || config.price_ids.length === 0)
			) {
				return false;
			}
		}

		if (reward.rewardCategory === "free_product" && !reward.free_product_id) {
			return false;
		}

		if (reward.rewardCategory === "feature_grant") {
			if (reward.featureGrantEntitlements.length === 0) return false;
			const featureIds = features.map((f) => f.id);
			if (
				reward.featureGrantEntitlements.some(
					(e) => !e.feature_id || !featureIds.includes(e.feature_id),
				)
			)
				return false;
			if (
				reward.featureGrantEntitlements.some(
					(e) => !e.allowance || e.allowance <= 0,
				)
			)
				return false;
			if (
				!reward.promo_codes?.length ||
				!reward.promo_codes.some((pc) => pc.code)
			)
				return false;
		}

		return true;
	};

	const handleCreate = async () => {
		if (!isFormValid()) return;

		setLoading(true);
		try {
			const apiReward = mapFrontendToApiReward({
				frontendReward: reward,
				features,
			});

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

					{reward.rewardCategory === "feature_grant" && (
						<FeatureGrantRewardConfig reward={reward} setReward={setReward} />
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
						disabled={!isFormValid()}
					>
						Create reward
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
