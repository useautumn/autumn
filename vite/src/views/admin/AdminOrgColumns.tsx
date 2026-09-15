import type { OrgClaimState } from "@autumn/shared";
import { MiniCopyButton } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
import type { UserWithRole } from "better-auth/plugins";
import { AdminCreatedAt } from "./components/AdminCreatedAt";
import { AdminOrgActionsCell } from "./components/AdminOrgActionsCell";
import { AdminOrgNameCell } from "./components/AdminOrgNameCell";
import { AdminOrgStatusCell } from "./components/AdminOrgStatusCell";
import { AdminOrgUsersCell } from "./components/AdminOrgUsersCell";

export type AdminOrg = {
	id: string;
	name: string;
	slug: string;
	createdAt: string;
	claim_state: OrgClaimState | null;
	users: UserWithRole[];
	requestBlockSummary: {
		blockAll: boolean;
		ruleCount: number;
	};
	redis_config: {
		url: string;
		migrationPercent: number;
	} | null;
};

const hiddenOnMobile = { mobileCard: "hidden" as const };

export const createAdminOrgColumns = ({
	onManageRequestBlocks,
	onManageRedis,
}: {
	onManageRequestBlocks: (org: AdminOrg) => void;
	onManageRedis: (org: AdminOrg) => void;
}): ColumnDef<AdminOrg, unknown>[] => [
	{
		id: "name",
		header: "Name",
		accessorKey: "name",
		size: 200,
		cell: ({ row }: { row: Row<AdminOrg> }) => (
			<AdminOrgNameCell org={row.original} />
		),
	},
	{
		id: "users",
		header: "Users",
		accessorKey: "users",
		size: 300,
		meta: hiddenOnMobile,
		cell: ({ row }: { row: Row<AdminOrg> }) => (
			<AdminOrgUsersCell users={row.original.users} />
		),
	},
	{
		id: "createdAt",
		header: "Created",
		accessorKey: "createdAt",
		size: 92,
		cell: ({ row }: { row: Row<AdminOrg> }) => (
			<AdminCreatedAt createdAt={row.original.createdAt} />
		),
	},
	{
		id: "slug",
		header: "Slug",
		accessorKey: "slug",
		size: 150,
		meta: hiddenOnMobile,
		cell: ({ row }: { row: Row<AdminOrg> }) => (
			<MiniCopyButton text={row.original.slug} innerClassName="text-xs" />
		),
	},
	{
		id: "status",
		header: "Status",
		size: 120,
		enableSorting: false,
		meta: hiddenOnMobile,
		cell: ({ row }: { row: Row<AdminOrg> }) => (
			<AdminOrgStatusCell org={row.original} />
		),
	},
	{
		id: "id",
		header: "ID",
		accessorKey: "id",
		size: 140,
		meta: hiddenOnMobile,
		cell: ({ row }: { row: Row<AdminOrg> }) => (
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
		cell: ({ row }: { row: Row<AdminOrg> }) => (
			<AdminOrgActionsCell
				onManageRedis={onManageRedis}
				onManageRequestBlocks={onManageRequestBlocks}
				org={row.original}
			/>
		),
	},
];
