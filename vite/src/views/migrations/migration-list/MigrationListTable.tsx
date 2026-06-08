import { ArrowsClockwiseIcon, TestTubeIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { Badge } from "@/components/v2/badges/Badge";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import {
	useMigrationsQuery,
	type MigrationWithRunInfo,
} from "@/hooks/queries/useMigrationsQuery";
import { pushPage } from "@/utils/genUtils";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { useMigrationsQueryState } from "@/views/migrations/hooks/useMigrationsQueryState";
import { createMigrationListColumns } from "./MigrationListColumns";
import { MigrationListCreateButton } from "./MigrationListCreateButton";
import { MigrationListMenuButton } from "./MigrationListMenuButton";

export function MigrationListTable() {
	const { migrations, isLoading } = useMigrationsQuery();
	const { queryStates } = useMigrationsQueryState();

	const filteredMigrations = useMemo(
		() =>
			migrations.filter((m) =>
				queryStates.showArchived ? m.archived : !m.archived,
			),
		[migrations, queryStates.showArchived],
	);

	const columns = useMemo(() => createMigrationListColumns(), []);

	const table = useProductTable({
		data: filteredMigrations,
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
		},
	});

	const getRowHref = (row: MigrationWithRunInfo) =>
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
				emptyStateText: queryStates.showArchived
					? "You haven't archived any migrations yet"
					: undefined,
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
						<Tooltip>
							<TooltipTrigger className="inline-flex cursor-default">
								<Badge
									variant="muted"
									className="text-[10px] px-1.5 py-0 gap-1 cursor-default text-amber-600 dark:text-amber-400"
								>
									<TestTubeIcon size={12} weight="fill" />
									Beta
								</Badge>
							</TooltipTrigger>
							<TooltipContent side="right">
								Migrations are in beta. Get in touch with the team for more
								complex migrations.
							</TooltipContent>
						</Tooltip>
					</Table.Heading>
					<Table.Actions>
						<div className="flex items-center gap-2">
							<MigrationListCreateButton />
							<MigrationListMenuButton />
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
