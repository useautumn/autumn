import type { CreateRewardProgram } from "@autumn/shared";
import { RewardReceivedBy, RewardTriggerEvent } from "@autumn/shared";
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
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { RewardProgramConfig } from "./RewardProgramConfig";

const defaultRewardProgram: CreateRewardProgram = {
	id: "",
	// trigger: {
	//   type: RewardTriggerEvent.SignUp,
	//   product_ids: [],
	//   exclude_trial: false,
	// },
	when: RewardTriggerEvent.CustomerCreation,
	product_ids: [],
	exclude_trial: false,
	internal_reward_id: "",
	max_redemptions: 0,
	received_by: RewardReceivedBy.Referrer,
};

function CreateRewardProgramModal() {
	const { refetch } = useRewardsQuery();
	const axiosInstance = useAxiosInstance();

	const [isLoading, setIsLoading] = useState(false);
	const [open, setOpen] = useState(false);

	const [rewardProgram, setRewardProgram] = useState(defaultRewardProgram);

	useEffect(() => {
		if (open) {
			setRewardProgram(defaultRewardProgram);
		}
	}, [open]);

	const handleCreate = () => {
		setIsLoading(true);
		(async () => {
			try {
				await axiosInstance.post("/v1/reward_programs", rewardProgram);

				await refetch();
				setOpen(false);
			} catch (error) {
				toast.error(getBackendErr(error, "Failed to create referral program"));
			} finally {
				setIsLoading(false);
			}
		})();
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="add">Referral Program</Button>
			</DialogTrigger>
			<DialogContent className="w-[500px]">
				<DialogHeader>
					<DialogTitle>Create Referral Program</DialogTitle>
				</DialogHeader>
				<RewardProgramConfig
					rewardProgram={rewardProgram as any}
					setRewardProgram={setRewardProgram}
				/>
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

export default CreateRewardProgramModal;
