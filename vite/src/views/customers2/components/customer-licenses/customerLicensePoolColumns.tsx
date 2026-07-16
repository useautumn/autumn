import type { ProductV2 } from "@autumn/shared";
import type { Row } from "@tanstack/react-table";
import {
	hiddenSkeleton,
	nameWithIconSkeleton,
} from "@/components/general/table";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { createDateTimeColumn } from "@/views/customers2/utils/ColumnHelpers";
import { LicensePlanPrice } from "./LicensePlanPrice";

export interface CustomerLicensePoolRow {
	id: string;
	licensePlanId: string | null;
	name: string;
	product: ProductV2 | null;
	remaining: number;
	granted: number;
	paidQuantity: number;
	createdAt: number;
}

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

/** Mirrors the plans table's Scope column so both tables' flexible columns
 * resolve to identical widths. License pools are always customer-scoped. */
const scopeColumn = {
	header: "Scope",
	accessorKey: "scope",
	cell: () => <span className="text-muted-foreground">Customer</span>,
};

export const createCustomerLicensePoolColumns = ({
	hasEntities,
}: {
	hasEntities: boolean;
}) => [
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
	...(hasEntities ? [scopeColumn] : []),
	{
		header: "Price",
		accessorKey: "price",
		size: 120,
		cell: ({ row }: { row: Row<CustomerLicensePoolRow> }) => {
			const { product, granted, paidQuantity } = row.original;
			return (
				<LicensePlanPrice
					product={product}
					includedQuantity={granted - paidQuantity}
					paidQuantity={paidQuantity}
				/>
			);
		},
	},
	{
		header: "Status",
		accessorKey: "status",
		size: 110,
		cell: ({ row }: { row: Row<CustomerLicensePoolRow> }) => (
			<div className="flex items-baseline gap-1 truncate">
				<span className="text-muted-foreground">
					{formatNumber(row.original.remaining)}
				</span>
				<span className="text-subtle">remaining</span>
			</div>
		),
	},
	{
		...createDateTimeColumn<CustomerLicensePoolRow>({
			header: "Created At",
			accessorKey: "createdAt",
			withYear: true,
		}),
		size: 150,
	},
	{
		id: "actions",
		header: "",
		size: 40,
		meta: { skeleton: hiddenSkeleton },
		// Spacer matching the plans table's actions column so both tables'
		// flexible columns resolve to identical widths.
		cell: () => null,
	},
];
