import type { ApiKey } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
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
