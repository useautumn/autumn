import type { FullCusProduct } from "@autumn/shared";
import {
	getCoreRowModel,
	getFilteredRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useFullCusSearchQuery } from "@/views/customers/hooks/useFullCusSearchQuery";
import { useSavedViewsQuery } from "@/views/customers/hooks/useSavedViewsQuery";
import { AttachProductDropdown } from "./AttachProductDropdown";
import { CancelProductDialog } from "./CancelProductDialog";
import { CustomerProductsColumns } from "./CustomerProductsColumns";
import { filterCustomerProducts } from "./customerProductsTableFilters";
import { ShowExpiredActionButton } from "./ShowExpiredActionButton";

export function CustomerProductsTable() {
	const { customer, isLoading } = useCusQuery();

	const [showExpired, setShowExpired] = useQueryState(
		"customerProductsShowExpired",
		parseAsBoolean.withDefault(true),
	);

	const [cancelOpen, setCancelOpen] = useState(false);
	const [selectedProduct, setSelectedProduct] = useState<FullCusProduct | null>(
		null,
	);

	useSavedViewsQuery();
	useFullCusSearchQuery();

	const filteredCustomers = useMemo(
		() =>
			filterCustomerProducts({
				customer,
				showExpired: showExpired ?? true,
			}),
		[customer, showExpired],
	);

	const attachedProductsTableColumns = useMemo(
		() => CustomerProductsColumns,
		[],
	);

	const handleCancelClick = (product: FullCusProduct) => {
		setSelectedProduct(product);
		setCancelOpen(true);
	};

	const enableSorting = false;
	const table = useReactTable({
		data: filteredCustomers,
		columns: attachedProductsTableColumns,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		globalFilterFn: "includesString",
		enableGlobalFilter: true,
		enableSorting,
		meta: {
			filterCustomerProducts,
			onCancelClick: handleCancelClick,
		},
	});

	return (
		<>
			{selectedProduct && (
				<CancelProductDialog
					cusProduct={selectedProduct}
					open={cancelOpen}
					setOpen={setCancelOpen}
				/>
			)}
			<Table.Provider
				config={{
					table,
					numberOfColumns: attachedProductsTableColumns.length,
					enableSorting,
					isLoading,
				}}
			>
				<Table.Container>
					<Table.Toolbar>
						<Table.Heading>Attached Products</Table.Heading>
						<Table.Actions>
							<ShowExpiredActionButton
								showExpired={showExpired}
								setShowExpired={setShowExpired}
							/>
							<AttachProductDropdown />
						</Table.Actions>
					</Table.Toolbar>
					<Table.Content>
						<Table.Header />
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</Table.Provider>
		</>
	);
}
