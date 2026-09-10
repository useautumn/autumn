import type { OrgClaimState } from "@autumn/shared";
import { Button, MiniCopyButton } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
import type { User } from "better-auth";
import { format } from "date-fns";
import { AdminOrgNameCell } from "./components/AdminOrgNameCell";
import { AdminOrgStatusCell } from "./components/AdminOrgStatusCell";
import { AdminOrgUsersCell } from "./components/AdminOrgUsersCell";
import { ImpersonateButton } from "./components/ImpersonateBtn";

export type AdminOrg = {
	id: string;
	name: string;
	slug: string;
	createdAt: string;
	claim_state: OrgClaimState | null;
	users: User[];
	requestBlockSummary: {
		blockAll: boolean;
		ruleCount: number;
	};
	redis_config: {
		url: string;
		migrationPercent: number;
	} | null;
};

// AdminOrgNameCell renders the whole mobile card, so nothing else joins it.
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
		id: "createdAt",
		header: "Created",
		accessorKey: "createdAt",
		size: 92,
		meta: hiddenOnMobile,
		cell: ({ row }: { row: Row<AdminOrg> }) => (
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
		cell: ({ row }: { row: Row<AdminOrg> }) => (
			<div className="group flex w-full font-mono">
				<MiniCopyButton text={row.original.id} innerClassName="text-xs" />
			</div>
		),
	},
	{
		// Deliberately not `actions`: that id makes mobile cards pin the buttons
		// into the card header, squeezing out the org name.
		id: "orgActions",
		header: "Actions",
		size: 200,
		enableSorting: false,
		enableHiding: false,
		meta: hiddenOnMobile,
		cell: ({ row }: { row: Row<AdminOrg> }) => {
			const firstNonAdminUser = row.original.users.find(
				(user) => user.role !== "admin",
			);

			// Org-level admin actions (Block, Redis) must remain reachable even when
			// the org has only admin users — gating them on `firstNonAdminUser`
			// would silently hide them. Only `ImpersonateButton` requires a
			// non-admin user to target.
			return (
				<div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => onManageRequestBlocks(row.original)}
					>
						Block
					</Button>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => onManageRedis(row.original)}
					>
						Redis
					</Button>
					{firstNonAdminUser && (
						<ImpersonateButton userId={firstNonAdminUser.id} />
					)}
				</div>
			);
		},
	},
];
