import type { Migration } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { format } from "date-fns";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";

export const createMigrationListColumns = (): ColumnDef<
	Migration,
	unknown
>[] => [
	{
		header: "ID",
		size: 240,
		accessorKey: "id",
		cell: ({ row }: { row: Row<Migration> }) => (
			<div className="font-mono justify-start flex w-full group overflow-hidden">
				<MiniCopyButton text={row.original.id} />
			</div>
		),
	},
	{
		header: "Filter",
		size: 120,
		cell: ({ row }: { row: Row<Migration> }) => (
			<span className="text-xs text-t3">
				{row.original.filter ? "Configured" : "—"}
			</span>
		),
	},
	{
		header: "Operations",
		size: 120,
		cell: ({ row }: { row: Row<Migration> }) => (
			<span className="text-xs text-t3">
				{row.original.operations ? "Configured" : "—"}
			</span>
		),
	},
	{
		header: "Created",
		size: 160,
		accessorKey: "created_at",
		cell: ({ row }: { row: Row<Migration> }) => (
			<span className="text-xs text-t3">
				{format(new Date(row.original.created_at), "PP")}
			</span>
		),
	},
];
