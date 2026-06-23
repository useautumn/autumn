import { Badge, Button, MiniCopyButton } from "@autumn/ui";
import type { ColumnDef, Row } from "@tanstack/react-table";
import type { User } from "better-auth";
import { format } from "date-fns";
import { ImpersonateButton } from "./components/ImpersonateBtn";

export type AdminOrg = {
	id: string;
	name: string;
	slug: string;
	createdAt: string;
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

export const createAdminOrgColumns = ({
	onManageRequestBlocks,
	onManageRedis,
}: {
	onManageRequestBlocks: (org: AdminOrg) => void;
	onManageRedis: (org: AdminOrg) => void;
}): ColumnDef<AdminOrg, unknown>[] => [
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
			return <div className="font-medium text-foreground">{value}</div>;
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
				<div className="text-xs text-subtle whitespace-nowrap">
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
				<div className="text-xs text-tertiary-foreground truncate">
					{users.map((user) => user.email).join(", ")}
				</div>
			);
		},
	},
	{
		id: "requestBlock",
		header: "Request blocks",
		accessorKey: "requestBlockSummary",
		cell: ({ row }: { row: Row<AdminOrg> }) => {
			const summary = row.original.requestBlockSummary;

			if (summary.blockAll) {
				return (
					<Badge className="bg-red-50 text-red-700 border-red-200">
						Blocked
					</Badge>
				);
			}

			if (summary.ruleCount > 0) {
				return (
					<Badge className="bg-amber-50 text-amber-700 border-amber-200">
						{summary.ruleCount} rule{summary.ruleCount === 1 ? "" : "s"}
					</Badge>
				);
			}

			return <Badge variant="muted">Open</Badge>;
		},
	},
	{
		id: "redisConfig",
		header: "Redis",
		accessorKey: "redis_config",
		cell: ({ row }: { row: Row<AdminOrg> }) => {
			const cfg = row.original.redis_config;
			if (!cfg) return <Badge variant="muted">Shared V2</Badge>;
			if (cfg.migrationPercent === 0) {
				return (
					<Badge className="bg-amber-50 text-amber-700 border-amber-200">
						Configured (0%)
					</Badge>
				);
			}
			if (cfg.migrationPercent === 100) {
				return (
					<Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
						100% routed
					</Badge>
				);
			}
			return (
				<Badge className="bg-blue-50 text-blue-700 border-blue-200">
					{cfg.migrationPercent}% routed
				</Badge>
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
			const firstNonAdminUser = users.find((user) => user.role !== "admin");

			// Org-level admin actions (Block, Redis) must remain reachable even when
			// the org has only admin users — gating them on `firstNonAdminUser`
			// would silently hide them. Only `ImpersonateButton` requires a
			// non-admin user to target.
			return (
				<div onClick={(e) => e.stopPropagation()} className="flex gap-2">
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
