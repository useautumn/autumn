import type { ApiInvoicePreviewV0, ProductV2 } from "@autumn/shared";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { createDateTimeColumn } from "@/views/customers2/utils/ColumnHelpers";
import {
	CustomerInvoiceStatus,
	UPCOMING_INVOICE_STATUS,
} from "./CustomerInvoiceStatus";
import { productIdsToNames } from "./getInvoiceProductNames";
import { InvoiceTotalCell } from "./invoiceAmountUtils";

type UpcomingInvoiceRow = ApiInvoicePreviewV0 & { id: string };

const getColumns = ({
	products,
}: {
	products: ProductV2[];
}): ColumnDef<UpcomingInvoiceRow>[] => [
	{
		header: "Products",
		accessorKey: "plan_ids",
		size: 360,
		cell: ({ row }: { row: Row<UpcomingInvoiceRow> }) => (
			<span className="truncate">
				{productIdsToNames({
					productIds: row.original.plan_ids,
					products,
				}) || "—"}
			</span>
		),
	},
	{
		header: "Total",
		accessorKey: "total",
		size: 120,
		cell: ({ row }: { row: Row<UpcomingInvoiceRow> }) => {
			const preview = row.original;
			return (
				<InvoiceTotalCell
					total={preview.total}
					currency={preview.currency}
					discountAmount={preview.subtotal - preview.total}
				/>
			);
		},
	},
	{
		header: "Status",
		accessorKey: "subscription_id",
		cell: () => <CustomerInvoiceStatus override={UPCOMING_INVOICE_STATUS} />,
	},
	createDateTimeColumn<UpcomingInvoiceRow>({
		header: "Date",
		accessorKey: "invoice_at",
		withYear: true,
	}),
];

export function CustomerUpcomingInvoices({
	invoicePreviews,
	isLoading,
	products,
}: {
	invoicePreviews: ApiInvoicePreviewV0[] | null | undefined;
	isLoading: boolean;
	products: ProductV2[];
}) {
	const setSheet = useSheetStore((s) => s.setSheet);
	const columns = useMemo(() => getColumns({ products }), [products]);

	const rows = useMemo(
		() =>
			invoicePreviews?.map((preview) => ({
				...preview,
				id: preview.subscription_id,
			})) ?? [],
		[invoicePreviews],
	);

	const table = useCustomerTable({ data: rows, columns });

	if (!(isLoading || rows.length)) return null;

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length,
				enableSorting: false,
				isLoading,
				skeletonRowCount: 1,
				onRowClick: (row: UpcomingInvoiceRow) =>
					setSheet({
						type: "upcoming-invoice-detail",
						data: { preview: row },
					}),
				flexibleTableColumns: false,
				mobileCards: true,
				rowClassName: "h-10 py-0",
			}}
		>
			<Table.Container>
				<Table.Content>
					<Table.Header />
					<Table.Body />
				</Table.Content>
			</Table.Container>
		</Table.Provider>
	);
}
