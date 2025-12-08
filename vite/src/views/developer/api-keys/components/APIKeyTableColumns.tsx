import type { ApiKey } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { CalendarIcon } from "lucide-react";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { APIKeyToolbar } from "./APIKeyToolbar";

export const createAPIKeyTableColumns = (): ColumnDef<ApiKey, unknown>[] => [
	{
		size: 150,
		header: "Name",
		accessorKey: "name",
		cell: ({ row }: { row: Row<ApiKey> }) => {
			return <div className="font-medium text-t1">{row.original.name}</div>;
		},
	},
	{
		header: "Preview",
		size: 300,
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
