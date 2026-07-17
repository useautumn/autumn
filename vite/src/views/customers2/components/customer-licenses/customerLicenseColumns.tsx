import type { ApiCustomerLicenseV0, ProductV2 } from "@autumn/shared";
import { DropdownMenuItem } from "@autumn/ui";
import type { Row } from "@tanstack/react-table";
import { CheckIcon } from "lucide-react";
import { AdminHover } from "@/components/general/AdminHover";
import {
	hiddenSkeleton,
	nameWithIconSkeleton,
	statusSkeleton,
	TableDropdownMenuCell,
} from "@/components/general/table";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { createDateTimeColumn } from "@/views/customers2/utils/ColumnHelpers";
import { LicensePlanPrice } from "./LicensePlanPrice";

export interface LicenseAssignmentRow {
	id: string;
	name: string;
	product: ProductV2 | null;
	started_at: number;
	pool: ApiCustomerLicenseV0;
}

export const createCustomerLicenseColumns = ({
	onUnassign,
	entityName,
}: {
	onUnassign: (row: LicenseAssignmentRow) => void;
	/** Shown in a Scope column mirroring the plans table's; omit when the
	 * customer has no entities (the plans table drops Scope too). */
	entityName?: string;
}) => [
	{
		header: "Name",
		accessorKey: "name",
		size: 150,
		meta: { skeleton: nameWithIconSkeleton },
		cell: ({ row }: { row: Row<LicenseAssignmentRow> }) => (
			<div className="font-medium text-foreground flex items-center gap-2">
				<LicenseIcon size={14} className="shrink-0" />
				<AdminHover
					texts={[{ key: "Cus Product ID", value: row.original.id }]}
					triggerClassName="min-w-0"
				>
					<span className="truncate">{row.original.name}</span>
				</AdminHover>
			</div>
		),
	},
	...(entityName !== undefined
		? [
				{
					header: "Scope",
					accessorKey: "scope",
					cell: () => (
						<span className="text-muted-foreground truncate">{entityName}</span>
					),
				},
			]
		: []),
	{
		header: "Price",
		accessorKey: "price",
		size: 120,
		cell: ({ row }: { row: Row<LicenseAssignmentRow> }) => {
			const { product, pool } = row.original;
			return (
				<LicensePlanPrice
					product={product}
					includedQuantity={pool.granted - pool.paid_quantity}
					paidQuantity={pool.paid_quantity}
				/>
			);
		},
	},
	{
		header: "Status",
		accessorKey: "status",
		size: 110,
		meta: { skeleton: statusSkeleton },
		cell: () => (
			<div className="flex items-center gap-1.5">
				<CheckIcon
					className="text-white rounded-full p-0.5 bg-green-500 dark:bg-green-600"
					size={12}
				/>
				<span className="text-sm">Assigned</span>
			</div>
		),
	},
	{
		...createDateTimeColumn<LicenseAssignmentRow>({
			header: "Assigned At",
			accessorKey: "started_at",
			withYear: true,
		}),
		size: 150,
	},
	{
		id: "actions",
		header: "",
		size: 40,
		meta: { skeleton: hiddenSkeleton },
		cell: ({ row }: { row: Row<LicenseAssignmentRow> }) => (
			<div className="flex justify-end">
				<TableDropdownMenuCell>
					<DropdownMenuItem
						onClick={(e) => {
							e.stopPropagation();
							onUnassign(row.original);
						}}
					>
						Unassign
					</DropdownMenuItem>
				</TableDropdownMenuCell>
			</div>
		),
	},
];
