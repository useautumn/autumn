import { GiftIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Table } from "@/components/general/table";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { RewardsTable } from "./components/RewardsTable";
import { CreateRewardSheet } from "./reward-config/components/CreateRewardSheet";
import { CreateRewardProgramSheet } from "./reward-programs/CreateRewardProgramSheet";
import { RewardProgramsTable } from "./reward-programs/RewardProgramsTable";

export const RewardsPage = () => {
	const [createSheetOpen, setCreateSheetOpen] = useState(false);
	const { rewards } = useRewardsQuery();

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

	if (!rewards || rewards.length === 0) {
		return <EmptyState type="rewards" actionButton={<CreateRewardSheet />} />;
	}

	return (
		<div className="h-fit max-h-full px-10">
			<div className="flex flex-col gap-8">
				{/* Rewards Table */}
				<div>
					<Table.Toolbar>
						<div className="flex w-full justify-between items-center">
							<Table.Heading>
								<GiftIcon size={16} weight="fill" className="text-subtle" />
								Rewards
							</Table.Heading>
							<Table.Actions>
								<CreateRewardSheet
									open={createSheetOpen}
									onOpenChange={setCreateSheetOpen}
								/>
							</Table.Actions>
						</div>
					</Table.Toolbar>
					<RewardsTable />
				</div>

				{/* Referral Programs Table */}
				<div>
					<Table.Toolbar>
						<div className="flex w-full justify-between items-center">
							<Table.Heading>
								<UsersThreeIcon
									size={16}
									weight="fill"
									className="text-subtle"
								/>
								Referral Programs
							</Table.Heading>
							<Table.Actions>
								<CreateRewardProgramSheet />
							</Table.Actions>
						</div>
					</Table.Toolbar>
					<RewardProgramsTable />
				</div>
			</div>
		</div>
	);
};
