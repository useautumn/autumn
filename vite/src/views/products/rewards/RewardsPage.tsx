import { useEffect, useState } from "react";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import LoadingScreen from "@/views/general/LoadingScreen";
import { RewardsTable } from "./components/RewardsTable";
import { CreateRewardSheet } from "./reward-config/components/CreateRewardSheet";
import { CreateRewardProgramSheet } from "./reward-programs/CreateRewardProgramSheet";
import { RewardProgramsTable } from "./reward-programs/RewardProgramsTable";

export const RewardsPage = () => {
	const { rewards, rewardPrograms } = useRewardsQuery();
	const [createSheetOpen, setCreateSheetOpen] = useState(false);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.key === "n" &&
				!e.metaKey &&
				!e.ctrlKey &&
				!e.altKey &&
				!e.shiftKey
			) {
				const target = e.target as HTMLElement;
				if (
					target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable
				) {
					return;
				}
				e.preventDefault();
				setCreateSheetOpen(true);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

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
					endContent={
						<CreateRewardSheet
							open={createSheetOpen}
							onOpenChange={setCreateSheetOpen}
						/>
					}
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
					endContent={<CreateRewardProgramSheet />}
					isSecondary
				/>
				<RewardProgramsTable />
			</div>
		</div>
	);
};
