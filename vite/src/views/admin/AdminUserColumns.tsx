import type { ColumnDef, Row } from "@tanstack/react-table";
import { format } from "date-fns";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import { ImpersonateButton } from "./components/ImpersonateBtn";

export type AdminUser = {
	id: string;
	name: string;
	email: string;
	createdAt: string;
	lastSignedIn: string;
};

export const createAdminUserColumns = (): ColumnDef<
	AdminUser,
	unknown
>[] => [
	{
		id: "id",
		header: "ID",
		accessorKey: "id",
		cell: ({ row }: { row: Row<AdminUser> }) => {
			const value = row.getValue("id") as string;
			return (
				<div className="font-mono justify-start flex w-full group">
					<MiniCopyButton text={value} />
				</div>
			);
		},
	},
	{
		id: "name",
		header: "Name",
		accessorKey: "name",
		cell: ({ row }: { row: Row<AdminUser> }) => {
			const value = row.getValue("name") as string;
			return <div className="font-medium text-t1">{value}</div>;
		},
	},
	{
		id: "email",
		header: "Email",
		accessorKey: "email",
		cell: ({ row }: { row: Row<AdminUser> }) => {
			const value = row.getValue("email") as string;
			return (
				<div className="truncate">
					<MiniCopyButton text={value} />
				</div>
			);
		},
	},
	{
		id: "createdAt",
		header: "Created At",
		accessorKey: "createdAt",
		cell: ({ row }: { row: Row<AdminUser> }) => {
			const value = row.getValue("createdAt") as string;
			return (
				<div className="text-xs text-t4 whitespace-nowrap">
					{format(new Date(value), "dd MMM HH:mm")}
				</div>
			);
		},
	},
	{
		id: "impersonate",
		header: "Actions",
		enableSorting: false,
		enableHiding: false,
		cell: ({ row }: { row: Row<AdminUser> }) => (
			<div onClick={(e) => e.stopPropagation()}>
				<ImpersonateButton userId={row.original.id} />
			</div>
		),
	},
];
