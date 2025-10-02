import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { RewardService } from "@/services/products/RewardService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { defaultReward } from "../utils/defaultRewardModels";
import { RewardConfig } from "./RewardConfig";

function CreateReward() {
	const axiosInstance = useAxiosInstance();
	const { refetch } = useRewardsQuery();

	const [isLoading, setIsLoading] = useState(false);
	const [open, setOpen] = useState(false);

	const [reward, setReward] = useState(defaultReward);

	useEffect(() => {
		if (open) {
			setReward(defaultReward);
		}
	}, [open]);

	const handleCreate = () => {
		setIsLoading(true);
		(async () => {
			if (!reward?.id && !reward?.name) {
				toast.error("ID and name are required");
				setIsLoading(false);
				return;
			}

			// Validate product selection for discount rewards
			if (reward.discount_config) {
				const { apply_to_all, price_ids } = reward.discount_config;
				if (!apply_to_all && (!price_ids || price_ids.length === 0)) {
					toast.error("Please select price(s) to apply this reward to");
					setIsLoading(false);
					return;
				}
			}

			try {
				await RewardService.createReward({
					axiosInstance,
					data: reward,
				});

				await refetch();
				setOpen(false);
			} catch (error) {
				console.log("Error:", error);
				toast.error(getBackendErr(error, "Failed to create coupon"));
			} finally {
				setIsLoading(false);
			}
		})();
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="add"> Reward</Button>
			</DialogTrigger>
			<DialogContent className="w-[500px]">
				<DialogHeader>
					<DialogTitle>Create Reward</DialogTitle>
				</DialogHeader>
				<RewardConfig reward={reward as any} setReward={setReward as any} />
				<DialogFooter>
					<Button
						onClick={handleCreate}
						isLoading={isLoading}
						variant="gradientPrimary"
					>
						Create
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default CreateReward;
