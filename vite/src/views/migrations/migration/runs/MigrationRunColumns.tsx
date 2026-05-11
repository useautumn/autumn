import type { MigrationRun } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/v2/badges/Badge";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import { RunStatusBadge } from "./RunStatusBadge";

function formatDuration(run: MigrationRun): string {
	if (!run.started_at) return "—";
	if (!run.finished_at) return "In progress";
	const durationMs = run.finished_at - run.started_at;
	if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
	if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
	return `${Math.round(durationMs / 60_000)}m`;
}

export const createMigrationRunColumns = (): ColumnDef<
	MigrationRun,
	unknown
>[] => [
	{
		header: "Run ID",
		size: 180,
		accessorKey: "internal_id",
		cell: ({ row }: { row: Row<MigrationRun> }) => (
			<div className="font-mono justify-start flex w-full group overflow-hidden">
				<MiniCopyButton text={row.original.internal_id} />
			</div>
		),
	},
	{
		header: "Type",
		size: 100,
		cell: ({ row }: { row: Row<MigrationRun> }) =>
			row.original.dry_run ? (
				<Badge variant="muted">Dry Run</Badge>
			) : (
				<Badge variant="green">Live</Badge>
			),
	},
	{
		header: "Status",
		size: 120,
		accessorKey: "status",
		cell: ({ row }: { row: Row<MigrationRun> }) => (
			<RunStatusBadge status={row.original.status} />
		),
	},
	{
		header: "Started",
		size: 140,
		accessorKey: "created_at",
		cell: ({ row }: { row: Row<MigrationRun> }) => (
			<span className="text-xs text-t3">
				{formatDistanceToNow(new Date(row.original.created_at), {
					addSuffix: true,
				})}
			</span>
		),
	},
	{
		header: "Duration",
		size: 100,
		cell: ({ row }: { row: Row<MigrationRun> }) => (
			<span className="text-xs text-t3">{formatDuration(row.original)}</span>
		),
	},
	{
		header: "Error",
		size: 200,
		accessorKey: "error_message",
		cell: ({ row }: { row: Row<MigrationRun> }) => {
			const error = row.original.error_message;
			if (!error) return <span className="text-xs text-t3">—</span>;
			return (
				<span className="text-xs text-red-500 truncate block" title={error}>
					{error}
				</span>
			);
		},
	},
];
