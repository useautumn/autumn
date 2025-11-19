import type { ApiKey } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
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
						<CopyButton
							text={apiKey.prefix}
							size="mini"
							className="w-fit bg-transparent justify-end px-0! border-none shadow-none hover:text-primary [&_svg]:opacity-0 group-hover:[&_svg]:opacity-100 max-w-full"
						/>
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

