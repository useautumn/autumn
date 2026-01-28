import type { ColumnDef, Row } from "@tanstack/react-table";
import type { User } from "better-auth";
import { format } from "date-fns";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import { ImpersonateButton } from "./components/ImpersonateBtn";

export type AdminOrg = {
	id: string;
	name: string;
	slug: string;
	createdAt: string;
	users: User[];
};

export const createAdminOrgColumns = (): ColumnDef<
	AdminOrg,
	unknown
>[] => [
	{
		id: "id",
		header: "ID",
		accessorKey: "id",
		cell: ({ row }: { row: Row<AdminOrg> }) => {
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
		cell: ({ row }: { row: Row<AdminOrg> }) => {
			const value = row.getValue("name") as string;
			return <div className="font-medium text-t1">{value}</div>;
		},
	},
	{
		id: "slug",
		header: "Slug",
		accessorKey: "slug",
		cell: ({ row }: { row: Row<AdminOrg> }) => {
			const value = row.getValue("slug") as string;
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
		cell: ({ row }: { row: Row<AdminOrg> }) => {
			const value = row.getValue("createdAt") as string;
			return (
				<div className="text-xs text-t4 whitespace-nowrap">
					{format(new Date(value), "dd MMM HH:mm")}
				</div>
			);
		},
	},
	{
		id: "users",
		header: "Users",
		accessorKey: "users",
		cell: ({ row }: { row: Row<AdminOrg> }) => {
			const users = row.getValue("users") as User[];
			return (
				<div className="text-xs text-t3 truncate">
					{users.map((user) => user.email).join(", ")}
				</div>
			);
		},
	},
	{
		id: "impersonate",
		header: "Actions",
		enableSorting: false,
		enableHiding: false,
		cell: ({ row }: { row: Row<AdminOrg> }) => {
			const users = row.original.users;

			if (!users || users.length === 0) {
				return null;
			}

			return (
				<div onClick={(e) => e.stopPropagation()}>
					<ImpersonateButton userId={users?.[0]?.id} />
				</div>
			);
		},
	},
];
