import type { LicenseBalanceResponse } from "@autumn/shared";
import { DropdownMenuItem } from "@autumn/ui";
import type { Row } from "@tanstack/react-table";
import {
	hiddenSkeleton,
	nameWithIconSkeleton,
	TableDropdownMenuCell,
} from "@/components/general/table";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { createDateTimeColumn } from "@/views/customers2/utils/ColumnHelpers";

export interface LicenseAssignmentRow {
	id: string;
	name: string;
	started_at: number;
	pool: LicenseBalanceResponse;
}

export const createCustomerLicenseColumns = ({
	onUnassign,
}: {
	onUnassign: (row: LicenseAssignmentRow) => void;
}) => [
	{
		header: "Name",
		accessorKey: "name",
		size: 150,
		meta: { skeleton: nameWithIconSkeleton },
		cell: ({ row }: { row: Row<LicenseAssignmentRow> }) => (
			<div className="font-medium text-foreground flex items-center gap-2">
				<LicenseIcon size={14} className="shrink-0" />
				{row.original.name}
			</div>
		),
	},
	{
		header: "Availability",
		accessorKey: "availability",
		size: 150,
		cell: ({ row }: { row: Row<LicenseAssignmentRow> }) => {
			const { inventory } = row.original.pool;
			const total = inventory.included;
			return (
				<span className="text-tertiary-foreground">
					{inventory.available} of {total} available
				</span>
			);
		},
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
					<DropdownMenuItem onClick={() => onUnassign(row.original)}>
						Unassign
					</DropdownMenuItem>
				</TableDropdownMenuCell>
			</div>
		),
	},
];
