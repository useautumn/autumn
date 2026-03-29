import { TrophyIcon } from "@phosphor-icons/react";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Table } from "@/components/general/table";
import { pushPage } from "@/utils/genUtils";

type LeaderboardRow = {
	internal_customer_id: string;
	customer_name: string | null;
	customer_id: string | null;
	customer_email: string | null;
	total_volume: number;
	invoice_count: number;
	currency: string;
};

const formatCurrency = ({
	value,
	currency,
}: {
	value: number;
	currency: string;
}) => {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value / 100);
};

const createColumns = ({
	totalVolume,
}: {
	totalVolume: number;
}): ColumnDef<LeaderboardRow, unknown>[] => [
	{
		header: "#",
		id: "rank",
		size: 50,
		cell: ({ row }: { row: Row<LeaderboardRow> }) => (
			<span className="text-t3 tabular-nums">{row.index + 1}</span>
		),
	},
	{
		header: "Customer",
		accessorKey: "customer_name",
		cell: ({ row }: { row: Row<LeaderboardRow> }) => (
			<div className="flex flex-col">
				<span className="text-t1 truncate max-w-[200px]">
					{row.original.customer_name ||
						row.original.customer_id ||
						row.original.internal_customer_id}
				</span>
				{row.original.customer_email && (
					<span className="text-[11px] text-t3 truncate max-w-[200px]">
						{row.original.customer_email}
					</span>
				)}
			</div>
		),
	},
	{
		header: "Revenue",
		accessorKey: "total_volume",
		size: 140,
		cell: ({ row }: { row: Row<LeaderboardRow> }) => {
			const pct =
				totalVolume > 0
					? ((row.original.total_volume / totalVolume) * 100).toFixed(1)
					: "0";
			return (
				<span className="tabular-nums">
					{formatCurrency({
						value: row.original.total_volume,
						currency: row.original.currency,
					})}
					<span className="text-t4 ml-1">({pct}%)</span>
				</span>
			);
		},
	},
	{
		header: "Invoices",
		accessorKey: "invoice_count",
		size: 80,
		cell: ({ row }: { row: Row<LeaderboardRow> }) => (
			<span className="tabular-nums">{row.original.invoice_count}</span>
		),
	},
];

export const CustomerLeaderboardTable = ({
	data,
	loading,
}: {
	data: LeaderboardRow[];
	loading: boolean;
}) => {
	const navigate = useNavigate();

	const totalVolume = useMemo(
		() => data.reduce((sum, row) => sum + row.total_volume, 0),
		[data],
	);

	const columns = useMemo(() => createColumns({ totalVolume }), [totalVolume]);

	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		enableSorting: false,
		getRowId: (row) => row.internal_customer_id,
	});

	const handleRowClick = (row: LeaderboardRow) => {
		const customerId = row.customer_id || row.internal_customer_id;
		navigate(pushPage({ path: `/customers/${customerId}` }));
	};

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length,
				enableSorting: false,
				isLoading: loading,
				onRowClick: handleRowClick,
				emptyStateText: "No customer revenue data available",
				flexibleTableColumns: true,
			}}
		>
			<Table.Container>
				<Table.Toolbar>
					<div className="text-t3 text-md flex gap-2 items-center px-2">
						<TrophyIcon size={16} weight="fill" className="text-subtle" />
						Top Customers by Revenue
					</div>
				</Table.Toolbar>
				<Table.Content>
					<Table.Header />
					<Table.Body />
				</Table.Content>
			</Table.Container>
		</Table.Provider>
	);
};
