import { MiniCopyButton } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { AdminCreatedAt } from "./components/AdminCreatedAt";
import { AdminUserActionsCell } from "./components/AdminUserActionsCell";
import { AdminUserEmailCell } from "./components/AdminUserEmailCell";

export type AdminUser = {
	id: string;
	name: string;
	email: string;
	createdAt: string;
};

const hiddenOnMobile = { mobileCard: "hidden" as const };

export const createAdminUserColumns = (): ColumnDef<AdminUser, unknown>[] => [
	{
		id: "email",
		header: "Email",
		accessorKey: "email",
		size: 300,
		cell: ({ row }: { row: Row<AdminUser> }) => (
			<AdminUserEmailCell user={row.original} />
		),
	},
	{
		id: "createdAt",
		header: "Created",
		accessorKey: "createdAt",
		size: 100,
		cell: ({ row }: { row: Row<AdminUser> }) => (
			<AdminCreatedAt createdAt={row.original.createdAt} />
		),
	},
	{
		id: "name",
		header: "Name",
		accessorKey: "name",
		size: 160,
		meta: hiddenOnMobile,
		cell: ({ row }: { row: Row<AdminUser> }) => (
			<span className="truncate">{row.original.name}</span>
		),
	},
	{
		id: "id",
		header: "ID",
		accessorKey: "id",
		size: 140,
		cell: ({ row }: { row: Row<AdminUser> }) => (
			<div className="group flex w-full font-mono">
				<MiniCopyButton text={row.original.id} innerClassName="text-xs" />
			</div>
		),
	},
	{
		id: "actions",
		header: "Actions",
		size: 48,
		enableSorting: false,
		enableHiding: false,
		cell: ({ row }: { row: Row<AdminUser> }) => (
			<AdminUserActionsCell userId={row.original.id} />
		),
	},
];
