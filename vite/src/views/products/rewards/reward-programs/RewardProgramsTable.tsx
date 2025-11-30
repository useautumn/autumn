import type { RewardProgram } from "@autumn/shared";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { createRewardProgramsTableColumns } from "./RewardProgramsTableColumns";
import UpdateRewardProgram from "./UpdateRewardPrograms";

export const RewardProgramsTable = () => {
	const { rewardPrograms } = useRewardsQuery();
	const [selectedRewardProgram, setSelectedRewardProgram] =
		useState<RewardProgram | null>(null);
	const [open, setOpen] = useState(false);

	const columns = useMemo(() => createRewardProgramsTableColumns(), []);

	const programsTable = useProductTable({
		data: rewardPrograms || [],
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
		},
	});

	const handleRowClick = (program: RewardProgram) => {
		setSelectedRewardProgram(program);
		setOpen(true);
	};

	const enableSorting = false;

	const emptyStateText =
		"Referral programs automatically grant rewards (defined above) to customers who invite new users.";

	return (
		<>
			<UpdateRewardProgram
				open={open}
				setOpen={setOpen}
				selectedRewardProgram={selectedRewardProgram}
				setSelectedRewardProgram={setSelectedRewardProgram}
			/>
			<Table.Provider
				config={{
					table: programsTable,
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
