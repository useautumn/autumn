import {
	getCoreRowModel,
	getPaginationRowModel,
	type PaginationState,
	type RowSelectionState,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { TableFooter } from "@/components/general/table/table-footer";
import { getRefundChargeColumns } from "./RefundChargeColumns";
import type { RefundableChargeRow } from "./refundChargeTypes";

export const RefundChargeTable = ({
	charges,
	rowSelection,
	onRowSelectionChange,
	emptyText,
}: {
	charges: RefundableChargeRow[];
	rowSelection: RowSelectionState;
	onRowSelectionChange: (
		updater:
			| RowSelectionState
			| ((old: RowSelectionState) => RowSelectionState),
	) => void;
	emptyText: string;
}) => {
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 5,
	});
	const columns = useMemo(() => getRefundChargeColumns(), []);

	const table = useReactTable({
		data: charges,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		enableRowSelection: true,
		onRowSelectionChange,
		state: {
			rowSelection,
			pagination,
		},
		onPaginationChange: setPagination,
		getRowId: (row) => row.chargeId,
	});

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length + 1,
				isLoading: false,
				enableSelection: true,
				emptyStateText: emptyText,
				rowClassName: "h-14",
				flexibleTableColumns: true,
			}}
		>
			<Table.Container className="gap-3">
				<Table.Content>
					<Table.Header />
					<Table.Body />
				</Table.Content>
				<TableFooter table={table} pageSizeOptions={[5, 10, 25]} />
			</Table.Container>
		</Table.Provider>
	);
};
