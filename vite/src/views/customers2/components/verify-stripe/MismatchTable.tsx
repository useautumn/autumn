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
		<div className="rounded-lg border shadow-card overflow-hidden">
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
					<Table.Content className="!rounded-none !border-0 !shadow-none">
						<Table.Header />
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</Table.Provider>
		</div>
	);
}
