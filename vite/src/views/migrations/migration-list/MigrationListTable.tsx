import type { Migration } from "@autumn/shared";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { pushPage } from "@/utils/genUtils";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { createMigrationListColumns } from "./MigrationListColumns";
import { MigrationListCreateButton } from "./MigrationListCreateButton";

export function MigrationListTable() {
	const { migrations, isLoading } = useMigrationsQuery();

	const columns = useMemo(() => createMigrationListColumns(), []);

	const table = useProductTable({
		data: migrations,
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
		},
	});

	const getRowHref = (row: Migration) =>
		pushPage({ path: `/migrations/${row.id}` });

	if (!isLoading && migrations.length === 0) {
		return (
			<EmptyState
				type="migrations"
				actionButton={<MigrationListCreateButton />}
			/>
		);
	}

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length,
				enableSorting: false,
				isLoading,
				rowClassName: "h-10",
				getRowHref,
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
	);
}
