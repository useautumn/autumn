import { MiniCopyButton } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { format } from "date-fns";
import { AdminUserEmailCell } from "./components/AdminUserEmailCell";
import { ImpersonateButton } from "./components/ImpersonateBtn";

export type AdminUser = {
	id: string;
	name: string;
	email: string;
	createdAt: string;
};

// AdminUserEmailCell renders the whole mobile card, so nothing else joins it.
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
		id: "createdAt",
		header: "Created",
		accessorKey: "createdAt",
		size: 100,
		meta: hiddenOnMobile,
		cell: ({ row }: { row: Row<AdminUser> }) => (
			<span className="whitespace-nowrap text-subtle text-xs">
				{format(new Date(row.original.createdAt), "dd MMM HH:mm")}
			</span>
		),
	},
	{
		id: "id",
		header: "ID",
		accessorKey: "id",
		size: 140,
		meta: hiddenOnMobile,
		cell: ({ row }: { row: Row<AdminUser> }) => (
			<div className="group flex w-full font-mono">
				<MiniCopyButton text={row.original.id} innerClassName="text-xs" />
			</div>
		),
	},
	{
		id: "actions",
		header: "Actions",
		size: 120,
		enableSorting: false,
		enableHiding: false,
		cell: ({ row }: { row: Row<AdminUser> }) => (
			<div onClick={(e) => e.stopPropagation()}>
				<ImpersonateButton userId={row.original.id} />
			</div>
		),
	},
];
