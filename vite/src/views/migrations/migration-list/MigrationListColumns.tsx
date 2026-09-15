import { MiniCopyButton } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { format } from "date-fns";
import type { MigrationWithRunInfo } from "@/hooks/queries/useMigrationsQuery";
import { MigrationStatusBadge } from "../migration/shared/MigrationStatusBadge";
import { MigrationListRowToolbar } from "./MigrationListRowToolbar";

export const createMigrationListColumns = (): ColumnDef<
	MigrationWithRunInfo,
	unknown
>[] => [
	{
		header: "ID",
		size: 240,
		accessorKey: "id",
		cell: ({ row }: { row: Row<MigrationWithRunInfo> }) => (
			<div className="font-mono justify-start flex w-full group overflow-hidden">
				<MiniCopyButton text={row.original.id} />
			</div>
		),
	},
	{
		header: "Status",
		size: 140,
		cell: ({ row }: { row: Row<MigrationWithRunInfo> }) => (
			<MigrationStatusBadge
				status={row.original.status}
				blockedBy={row.original.blocked_by}
			/>
		),
	},
	{
		header: "Filter",
		size: 120,
		cell: ({ row }: { row: Row<MigrationWithRunInfo> }) => (
			<span className="text-xs text-tertiary-foreground">
				{row.original.filter ? "Configured" : "—"}
			</span>
		),
	},
	{
		header: "Operations",
		size: 120,
		cell: ({ row }: { row: Row<MigrationWithRunInfo> }) => (
			<span className="text-xs text-tertiary-foreground">
				{row.original.operations ? "Configured" : "—"}
			</span>
		),
	},
	{
		header: "Created",
		size: 160,
		accessorKey: "created_at",
		cell: ({ row }: { row: Row<MigrationWithRunInfo> }) => (
			<span className="text-xs text-tertiary-foreground">
				{format(new Date(row.original.created_at), "PP")}
			</span>
		),
	},
	{
		header: "",
		accessorKey: "actions",
		size: 40,
		cell: ({ row }: { row: Row<MigrationWithRunInfo> }) => (
			<div
				className="flex justify-end w-full pr-2"
				onClick={(e) => e.stopPropagation()}
			>
				<MigrationListRowToolbar migration={row.original} />
			</div>
		),
	},
];
