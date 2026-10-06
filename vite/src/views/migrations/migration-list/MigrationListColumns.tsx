import { MiniCopyButton } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { MigrationFilterCell } from "./cells/MigrationFilterCell";
import { MigrationOperationsCell } from "./cells/MigrationOperationsCell";
import { MigrationStatusCell } from "./cells/MigrationStatusCell";
import { MigrationListRowToolbar } from "./MigrationListRowToolbar";
import type { MigrationListRow } from "./rowView/deriveMigrationRowView";

type CellProps = { row: Row<MigrationListRow> };

export const createMigrationListColumns = (): ColumnDef<
	MigrationListRow,
	unknown
>[] => [
	{
		header: "ID",
		size: 220,
		accessorKey: "id",
		cell: ({ row }: CellProps) => (
			<div className="font-mono justify-start flex w-full group overflow-hidden">
				<MiniCopyButton text={row.original.id} />
			</div>
		),
	},
	{
		header: "Status",
		size: 200,
		cell: ({ row }: CellProps) => (
			<MigrationStatusCell view={row.original.view} />
		),
	},
	{
		header: "Filter",
		size: 200,
		cell: ({ row }: CellProps) => (
			<MigrationFilterCell view={row.original.view} />
		),
	},
	{
		header: "Operations",
		size: 360,
		meta: { grow: true },
		cell: ({ row }: CellProps) => (
			<MigrationOperationsCell view={row.original.view} />
		),
	},
	{
		header: "",
		accessorKey: "actions",
		size: 40,
		cell: ({ row }: CellProps) => (
			<div
				className="flex justify-end w-full pr-2"
				onClick={(e) => e.stopPropagation()}
			>
				<MigrationListRowToolbar migration={row.original} />
			</div>
		),
	},
];
