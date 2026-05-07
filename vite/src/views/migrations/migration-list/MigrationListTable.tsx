import type { Migration } from "@autumn/shared";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import EditMigrationSheet from "../components/EditMigrationSheet";
import { createMigrationListColumns } from "./MigrationListColumns";
import { MigrationListCreateButton } from "./MigrationListCreateButton";

export function MigrationListTable() {
	const { migrations, isLoading } = useMigrationsQuery();
	const [selected, setSelected] = useState<Migration | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);

	const columns = useMemo(() => createMigrationListColumns(), []);

	const table = useProductTable({
		data: migrations,
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
		},
	});

	const hasRows = table.getRowModel().rows.length > 0;

	const handleRowClick = (row: Migration) => {
		setSelected(row);
		setSheetOpen(true);
	};

	if (!isLoading && !hasRows) {
		return (
			<EmptyState
				type="migrations"
				actionButton={<MigrationListCreateButton />}
			/>
		);
	}

	return (
		<>
			<Table.Provider
				config={{
					table,
					numberOfColumns: columns.length,
					enableSorting: false,
					isLoading,
					rowClassName: "h-10",
					onRowClick: handleRowClick,
				}}
			>
				<Table.Toolbar>
					<div className="flex w-full justify-between items-center">
						<Table.Heading>
							<ArrowsClockwiseIcon
								size={16}
								weight="fill"
								className="text-subtle"
							/>
							Migrations
						</Table.Heading>
						<Table.Actions>
							<div className="flex items-center gap-2">
								<MigrationListCreateButton />
							</div>
						</Table.Actions>
					</div>
				</Table.Toolbar>
				<div>
					<Table.Container>
						<Table.Content>
							<Table.Header />
							<Table.Body />
						</Table.Content>
					</Table.Container>
				</div>
			</Table.Provider>
			<EditMigrationSheet
				migration={selected}
				open={sheetOpen}
				onOpenChange={(open) => {
					setSheetOpen(open);
					if (!open) setSelected(null);
				}}
			/>
		</>
	);
}
