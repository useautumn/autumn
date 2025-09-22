import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import LoadingScreen from "@/views/general/LoadingScreen";
import { RewardsTable } from "./components/RewardsTable";
import CreateReward from "./reward-config/CreateReward";
import { RewardProgramsTable } from "./reward-programs/RewardProgramsTable";
import CreateRewardProgram from "./reward-programs/CreateRewardProgram";

export const RewardsPage = () => {
	const { rewards, rewardPrograms } = useRewardsQuery();

	return (
		<div className="flex flex-col gap-16">
			<div>
				<PageSectionHeader
					title="Rewards"
					titleComponent={
						<span className="text-t2 px-1 rounded-md bg-stone-200 mr-2">
							{rewards?.length}
						</span>
					}
					endContent={<CreateReward />}
				/>

				<RewardsTable />
			</div>

			<div>
				<PageSectionHeader
					title="Referral Programs"
					titleComponent={
						<span className="text-t2 px-1 rounded-md bg-stone-200 mr-2">
							{rewardPrograms?.length}
						</span>
					}
					endContent={<CreateRewardProgram />}
					isSecondary
				/>
				<RewardProgramsTable />
			</div>
		</div>
	);
};
