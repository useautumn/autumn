import { Badge } from "@autumn/ui";
import type { Row } from "@tanstack/react-table";
import { nameWithIconSkeleton } from "@/components/general/table";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { createDateTimeColumn } from "@/views/customers2/utils/ColumnHelpers";

export interface CustomerLicensePoolRow {
	id: string;
	name: string;
	parentPlanName: string;
	remaining: number;
	granted: number;
	paidQuantity: number;
	createdAt: number;
}

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

export const customerLicensePoolColumns = [
	{
		header: "Name",
		accessorKey: "name",
		size: 150,
		meta: { skeleton: nameWithIconSkeleton },
		cell: ({ row }: { row: Row<CustomerLicensePoolRow> }) => (
			<div className="font-medium text-foreground flex items-center gap-2">
				<LicenseIcon size={14} className="shrink-0" />
				{row.original.name}
			</div>
		),
	},
	{
		header: "Plan",
		accessorKey: "parentPlanName",
		size: 150,
		cell: ({ row }: { row: Row<CustomerLicensePoolRow> }) => (
			<span className="text-tertiary-foreground">
				{row.original.parentPlanName}
			</span>
		),
	},
	{
		header: "Seats",
		accessorKey: "remaining",
		size: 180,
		cell: ({ row }: { row: Row<CustomerLicensePoolRow> }) => {
			const { remaining, granted, paidQuantity } = row.original;
			return (
				<div className="flex items-baseline gap-2 truncate">
					<div className="flex items-baseline gap-1">
						<span className="text-foreground">{formatNumber(remaining)}</span>
						<span className="text-subtle">/ {formatNumber(granted)} left</span>
					</div>
					{paidQuantity > 0 && (
						<Badge variant="muted" size="sm" className="shrink-0">
							{formatNumber(paidQuantity)} paid
						</Badge>
					)}
				</div>
			);
		},
	},
	{
		...createDateTimeColumn<CustomerLicensePoolRow>({
			header: "Created At",
			accessorKey: "createdAt",
			withYear: true,
		}),
		size: 150,
	},
];
