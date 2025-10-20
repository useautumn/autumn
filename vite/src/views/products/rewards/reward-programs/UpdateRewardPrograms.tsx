import type { RewardProgram } from "@autumn/shared";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { RewardProgramService } from "@/services/products/RewardProgramService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { RewardProgramConfig } from "./RewardProgramConfig";

interface UpdateRewardProgramProps {
	open: boolean;
	setOpen: (open: boolean) => void;
	selectedRewardProgram: RewardProgram | null;
	setSelectedRewardProgram: (reward: RewardProgram) => void;
}

function UpdateRewardProgram({
	open,
	setOpen,
	selectedRewardProgram,
	setSelectedRewardProgram,
}: UpdateRewardProgramProps) {
	const [updateLoading, setUpdateLoading] = useState(false);
	const { refetch } = useRewardsQuery();

	const env = useEnv();
	const axiosInstance = useAxiosInstance({ env });

	const handleUpdate = async () => {
		if (!selectedRewardProgram) return;

		setUpdateLoading(true);
		try {
			await RewardProgramService.updateReward({
				axiosInstance,
				internalId: selectedRewardProgram.internal_id,
				data: selectedRewardProgram,
			});
			toast.success("Referral program updated successfully");
			await refetch();
			setOpen(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update referral program"));
		} finally {
			setUpdateLoading(false);
		}
	};

	const handleCancel = () => {
		setOpen(false);
	};

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title="Update Referral Program"
					description="Modify your referral program settings"
				/>

				<div className="flex-1 overflow-y-auto">
					<SheetSection title="Program Configuration" withSeparator={false}>
						{selectedRewardProgram && (
							<RewardProgramConfig
								rewardProgram={selectedRewardProgram}
								setRewardProgram={setSelectedRewardProgram}
								isUpdate={true}
							/>
						)}
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
						onClick={handleUpdate}
						metaShortcut="enter"
						isLoading={updateLoading}
					>
						Update program
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export default UpdateRewardProgram;
