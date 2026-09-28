import type { SubscriptionMismatch } from "@autumn/shared";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { createVerifyMismatchColumns } from "./VerifyStripeColumns";

export function MismatchTable({
	mismatches,
}: {
	mismatches: SubscriptionMismatch[];
}) {
	const columns = useMemo(() => createVerifyMismatchColumns(), []);

	const table = useReactTable({
		data: mismatches,
		columns,
		getCoreRowModel: getCoreRowModel(),
		enableSorting: false,
	});

	return (
		<div>
			<Table.Provider
				config={{
					table,
					numberOfColumns: columns.length,
					isLoading: false,
					enableSorting: false,
					flexibleTableColumns: true,
				}}
			>
				<Table.Container>
					<Table.Content>
						<Table.Header />
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</Table.Provider>
		</div>
	);
}
