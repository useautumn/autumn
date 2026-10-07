import { BetaBadge } from "@autumn/ui";
import { getPaginationRowModel } from "@tanstack/react-table";
import { Workflow } from "lucide-react";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	type MigrationWithRunInfo,
	useMigrationsQuery,
} from "@/hooks/queries/useMigrationsQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { MIGRATION_LIST_PAGE_SIZE_OPTIONS } from "@/utils/constants/migrationListPagination";
import { pushPage } from "@/utils/genUtils";
import { useMigrationListPagination } from "@/views/migrations/hooks/useMigrationListPagination";
import { useMigrationsQueryState } from "@/views/migrations/hooks/useMigrationsQueryState";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { createMigrationListColumns } from "./MigrationListColumns";
import { MigrationListCreateButton } from "./MigrationListCreateButton";
import { MigrationListMenuButton } from "./MigrationListMenuButton";
import {
	createMigrationCatalog,
	type MigrationListRow,
	toMigrationListRows,
} from "./rowView/deriveMigrationRowView";

const LIST_POLL_MS = 5000;

function useMigrationListRows({
	migrations,
	customerCountPending,
}: {
	migrations: MigrationWithRunInfo[];
	customerCountPending: boolean;
}): MigrationListRow[] {
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();
	const { org } = useOrg();
	const currency = org?.default_currency ?? "USD";

	return useMemo(
		() =>
			toMigrationListRows({
				migrations,
				catalog: createMigrationCatalog({ products, features, currency }),
				now: Date.now(),
				customerCountPending,
			}),
		[migrations, products, features, currency, customerCountPending],
	);
}

export function MigrationListTable() {
	const { migrations, isLoading, isCountsLoading } = useMigrationsQuery({
		pollWhileActiveMs: LIST_POLL_MS,
	});
	const rows = useMigrationListRows({
		migrations,
		customerCountPending: isCountsLoading,
	});
	return <MigrationListTableView rows={rows} isLoading={isLoading} />;
}

export function MigrationListTableView({
	rows,
	isLoading,
}: {
	rows: MigrationListRow[];
	isLoading: boolean;
}) {
	const { queryStates } = useMigrationsQueryState();

	const filteredMigrations = useMemo(
		() =>
			rows.filter((m) => (queryStates.showArchived ? m.archived : !m.archived)),
		[rows, queryStates.showArchived],
	);

	const columns = useMemo(() => createMigrationListColumns(), []);

	const {
		pagination,
		onPaginationChange,
		currentPage,
		totalPages,
		pageSize,
		canGoPrev,
		canGoNext,
		goToPrevPage,
		goToNextPage,
		changePageSize,
	} = useMigrationListPagination({ rowCount: filteredMigrations.length });

	const table = useProductTable({
		data: filteredMigrations,
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
			getPaginationRowModel: getPaginationRowModel(),
			state: { pagination },
			onPaginationChange,
		},
	});

	const getRowHref = (row: MigrationListRow) =>
		pushPage({
			path: `/migrations/${row.id}`,
			queryParams: { step: row.status === "draft" ? undefined : "live" },
		});

	// Stay out of the way until there is more than one page's worth to page through.
	const showPagination =
		filteredMigrations.length > MIGRATION_LIST_PAGE_SIZE_OPTIONS[0];

	if (!isLoading && rows.length === 0) {
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
				emptyStateText: queryStates.showArchived
					? "You haven't archived any migrations yet"
					: undefined,
			}}
		>
			<Table.Toolbar>
				<div className="flex w-full justify-between items-center">
					<Table.Heading>
						<Workflow size={16} strokeWidth={2} className="text-subtle" />
						Migrations
						<BetaBadge />
					</Table.Heading>
					<Table.Actions>
						<div className="flex items-center gap-2">
							<MigrationListCreateButton />
							<MigrationListMenuButton />
						</div>
					</Table.Actions>
				</div>
			</Table.Toolbar>
			<InfoBox variant="info" classNames={{ infoBox: "-mt-4" }}>
				Migrations are in beta. For complex operations, please reach out to us
				at support@useautumn.com
			</InfoBox>
			<Table.Container>
				<Table.Content
					footer={
						showPagination && (
							<Table.PaginationFooter
								currentPage={currentPage}
								totalPages={totalPages}
								totalCount={filteredMigrations.length}
								canGoPrev={canGoPrev}
								canGoNext={canGoNext}
								onPrev={goToPrevPage}
								onNext={goToNextPage}
								pageSize={pageSize}
								pageSizeOptions={MIGRATION_LIST_PAGE_SIZE_OPTIONS}
								onPageSizeChange={changePageSize}
								enableHotkeys
							/>
						)
					}
				>
					<Table.Header />
					<Table.Body />
				</Table.Content>
			</Table.Container>
		</Table.Provider>
	);
}
