import type { Reward } from "@autumn/shared";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { UpdateRewardSheet } from "../reward-config/components/UpdateRewardSheet";
import { createRewardsTableColumns } from "./RewardsTableColumns";

export const RewardsTable = () => {
	const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
	const [open, setOpen] = useState(false);
	const { rewards } = useRewardsQuery();

	const columns = useMemo(() => createRewardsTableColumns(), []);

	const rewardsTable = useProductTable({
		data: rewards || [],
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
		},
	});

	const handleRowClick = (reward: Reward) => {
		setSelectedReward(reward);
		setOpen(true);
	};

	const enableSorting = false;

	const emptyStateText =
		"Create a coupon that customers can redeem for discounts, credits or free products.";

	return (
		<>
			<UpdateRewardSheet
				open={open}
				setOpen={setOpen}
				selectedReward={selectedReward}
			/>
			<Table.Provider
				config={{
					table: rewardsTable,
					numberOfColumns: columns.length,
					enableSorting,
					isLoading: false,
					onRowClick: handleRowClick,
					emptyStateText,
					rowClassName: "h-10",
				}}
			>
				<Table.Container>
					<Table.Content>
						<Table.Header />
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</Table.Provider>
		</>
	);
};
