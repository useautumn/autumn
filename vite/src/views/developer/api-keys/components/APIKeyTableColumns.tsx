import type { ApiKey } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { CalendarIcon, TerminalIcon, UserIcon } from "lucide-react";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { APIKeyToolbar } from "./APIKeyToolbar";

// Parse meta to get source info
function getSourceInfo(meta: ApiKey["meta"]): {
	type: "cli" | "dashboard" | null;
	author?: string;
} {
	if (!meta || typeof meta !== "object") return { type: null };

	if (meta.created_via === "oauth") {
		return { type: "cli" };
	}

	if (meta.author) {
		return { type: "dashboard", author: meta.author };
	}

	return { type: null };
}

export const createAPIKeyTableColumns = (): ColumnDef<ApiKey, unknown>[] => [
	{
		size: 120,
		header: "Name",
		accessorKey: "name",
		cell: ({ row }: { row: Row<ApiKey> }) => {
			return <div className="font-medium text-t1">{row.original.name}</div>;
		},
	},
	{
		header: "Preview",
		size: 150,
		accessorKey: "prefix",
		cell: ({ row }: { row: Row<ApiKey> }) => {
			const apiKey = row.original;
			return (
				<div className="font-mono justify-start flex w-full group overflow-hidden">
					{apiKey.prefix ? (
						<span className="text-tiny-id"> {apiKey.prefix}</span>
					) : (
						<span className="px-1 text-t3">—</span>
					)}
				</div>
			);
		},
	},
	{
		header: "Source",
		size: 100,
		accessorKey: "meta",
		cell: ({ row }: { row: Row<ApiKey> }) => {
			const source = getSourceInfo(row.original.meta);

			if (source.type === "cli") {
				return (
					<div className="flex justify-start items-center">
						<span className="text-tiny flex items-center gap-1 px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 rounded-md">
							<TerminalIcon size={12} />
							CLI
						</span>
					</div>
				);
			}

			if (source.type === "dashboard" && source.author) {
				return (
					<div className="flex justify-start items-center">
						<span className="text-tiny flex items-center gap-1 px-1.5 py-0.5 bg-muted text-t2 rounded-md">
							<UserIcon size={12} className="shrink-0" />
							{source.author}
						</span>
					</div>
				);
			}

			return <div className="text-t4">—</div>;
		},
	},
	{
		header: () => (
			<div className="flex items-center gap-1.5">
				<CalendarIcon size={14} className="text-t4" />
				<span>Created</span>
			</div>
		),
		accessorKey: "created_at",
		size: 120,
		cell: ({ row }: { row: Row<ApiKey> }) => {
			const { date, time } = formatUnixToDateTime(row.original.created_at);
			return (
				<div className="text-xs text-t3 pr-4 w-full">
					{date} <span className="truncate">{time}</span>
				</div>
			);
		},
	},
	{
		header: "",
		accessorKey: "actions",
		size: 40,
		enableSorting: false,
		cell: ({ row }: { row: Row<ApiKey> }) => {
			return (
				<div
					className="flex justify-end w-full pr-2"
					onClick={(e) => e.stopPropagation()}
				>
					<APIKeyToolbar apiKey={row.original} />
				</div>
			);
		},
	},
];
