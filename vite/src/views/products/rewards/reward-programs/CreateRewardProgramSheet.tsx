import type { CreateRewardProgram, RewardProgram } from "@autumn/shared";
import { RewardReceivedBy, RewardTriggerEvent } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import {
	Sheet,
	SheetContent,
	SheetTrigger,
} from "@/components/v2/sheets/Sheet";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { RewardProgramConfig } from "./RewardProgramConfig";

const defaultRewardProgram: CreateRewardProgram = {
	id: "",
	when: RewardTriggerEvent.CustomerCreation,
	product_ids: [],
	exclude_trial: false,
	internal_reward_id: "",
	max_redemptions: 0,
	received_by: RewardReceivedBy.Referrer,
};

interface CreateRewardProgramSheetProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

export function CreateRewardProgramSheet({
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
}: CreateRewardProgramSheetProps = {}) {
	const axiosInstance = useAxiosInstance();
	const { refetch } = useRewardsQuery();

	const [loading, setLoading] = useState(false);
	const [internalOpen, setInternalOpen] = useState(false);

	// Use controlled state if provided, otherwise use internal state
	const open = controlledOpen ?? internalOpen;
	const setOpen = controlledOnOpenChange ?? setInternalOpen;

	const [rewardProgram, setRewardProgram] = useState(defaultRewardProgram);

	// Reset state when sheet opens
	useEffect(() => {
		if (open) {
			setRewardProgram(defaultRewardProgram);
		}
	}, [open]);

	const handleCreate = async () => {
		// Validation
		if (!rewardProgram.id) {
			toast.error("Program ID is required");
			return;
		}

		if (!rewardProgram.internal_reward_id) {
			toast.error("Please select a reward");
			return;
		}

		if (!rewardProgram.when) {
			toast.error("Please select when to redeem the reward");
			return;
		}

		if (rewardProgram.when === RewardTriggerEvent.Checkout) {
			if (
				!rewardProgram.product_ids ||
				rewardProgram.product_ids.length === 0
			) {
				toast.error("Please select at least one plan for checkout trigger");
				return;
			}
		}

		setLoading(true);
		try {
			await axiosInstance.post("/v1/reward_programs", rewardProgram);

			await refetch();
			toast.success("Referral program created successfully");
			setOpen(false);
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to create referral program"),
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
				<Button variant="secondary" size="default">
					Create Referral Program
				</Button>
			</SheetTrigger>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title="Create Referral Program"
					description="Set up a referral program to reward customers"
				/>

				<div className="flex-1 overflow-y-auto">
					<SheetSection title="Program Configuration" withSeparator={false}>
						<RewardProgramConfig
							rewardProgram={rewardProgram as unknown as RewardProgram}
							setRewardProgram={
								setRewardProgram as (rewardProgram: RewardProgram) => void
							}
						/>
					</SheetSection>
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
						Create program
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
