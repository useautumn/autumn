import type { ProductV2, Reward } from "@autumn/shared";
import { analyzeRewardPrices } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { WarningBox } from "@/components/general/modal-components/WarningBox";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { RewardService } from "@/services/products/RewardService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { RewardConfig } from "./RewardConfig";

const checkRewardMigration = (
	reward: Reward,
	products: ProductV2[],
): { willMigrateCount: number; willNotMigrateCount: number } => {
	// Extract all available price IDs from current products
	const availablePriceIds: string[] = [];
	for (const product of products) {
		if (product.items) {
			for (const item of product.items) {
				if (item.price_id) {
					availablePriceIds.push(item.price_id);
				}
			}
		}
	}

	// Use the shared utility to analyze the reward
	const analysis = analyzeRewardPrices({
		reward,
		availablePriceIds,
	});

	return {
		willMigrateCount: analysis.validPriceCount,
		willNotMigrateCount: analysis.invalidPriceCount,
	};
};

function UpdateReward({
	open,
	setOpen,
	selectedReward,
	setSelectedReward,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	selectedReward: Reward | null;
	setSelectedReward: (reward: Reward) => void;
}) {
	const [updateLoading, setUpdateLoading] = useState(false);
	const { refetch } = useRewardsQuery();
	const { products } = useProductsQuery();

	const env = useEnv();
	const axiosInstance = useAxiosInstance({ env });

	if (!selectedReward) {
		setOpen(false);
		return;
	}

	const handleUpdate = async () => {
		setUpdateLoading(true);
		try {
			// Validate product selection for discount rewards
			if (selectedReward.discount_config) {
				const { apply_to_all, price_ids } = selectedReward.discount_config;
				if (!apply_to_all && (!price_ids || price_ids.length === 0)) {
					toast.error("Please select price(s) to apply this reward to");
					setUpdateLoading(false);
					return;
				}
			}

			// Check migration status and show warning if needed
			if (products) {
				const migrationResult = checkRewardMigration(selectedReward, products);
				if (migrationResult.willNotMigrateCount > 0) {
					toast.warning(
						`${migrationResult.willNotMigrateCount} price${migrationResult.willNotMigrateCount === 1 ? "" : "s"} won't be migrated to the latest product version.`,
						{
							duration: 5000,
						},
					);
				}
			}

			await RewardService.updateReward({
				axiosInstance,
				internalId: selectedReward.internal_id,
				data: selectedReward,
			});
			toast.success("Reward updated successfully");
			await refetch();
			setOpen(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update coupon"));
		}
		setUpdateLoading(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="w-[500px]">
				<DialogTitle>Update Reward</DialogTitle>
				<WarningBox>
					Existing customers with this coupon will not be affected
				</WarningBox>

				{selectedReward && (
					<RewardConfig reward={selectedReward} setReward={setSelectedReward} />
				)}

				<DialogFooter>
					<Button
						isLoading={updateLoading}
						onClick={() => handleUpdate()}
						variant="gradientPrimary"
					>
						Update
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default UpdateReward;
