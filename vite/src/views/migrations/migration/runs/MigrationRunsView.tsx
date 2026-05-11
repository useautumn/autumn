import type { MigrationRun } from "@autumn/shared";
import { ListIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { Separator } from "@/components/v2/separator";
import {
	useMigrationRunsQuery,
	type MigrationItemEvent,
} from "@/hooks/queries/useMigrationRunsQuery";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { createMigrationItemEventColumns } from "./MigrationItemEventColumns";
import { createMigrationRunColumns } from "./MigrationRunColumns";

export function MigrationRunsView({
	migrationId,
}: {
	migrationId: string;
}) {
	const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
	const { runs, isLoadingRuns, itemEvents, isLoadingEvents } =
		useMigrationRunsQuery({
			migrationId,
			migrationRunId: selectedRunId ?? undefined,
		});

	const runColumns = useMemo(() => createMigrationRunColumns(), []);
	const eventColumns = useMemo(() => createMigrationItemEventColumns(), []);
	const runsTable = useProductTable({ data: runs, columns: runColumns });
	const eventsTable = useProductTable({ data: itemEvents, columns: eventColumns });

	const handleRunRowClick = (row: MigrationRun) => {
		setSelectedRunId((prev) =>
			prev === row.internal_id ? null : row.internal_id,
		);
	};

	return (
		<div className="flex flex-col gap-6">
			<RunHistoryTable
				table={runsTable}
				columnCount={runColumns.length}
				isLoading={isLoadingRuns}
				onRowClick={handleRunRowClick}
			/>
			{selectedRunId && (
				<>
					<Separator />
					<ItemEventsTable
						table={eventsTable}
						columnCount={eventColumns.length}
						isLoading={isLoadingEvents}
						runId={selectedRunId}
					/>
				</>
			)}
		</div>
	);
}

function RunHistoryTable({
	table,
	columnCount,
	isLoading,
	onRowClick,
}: {
	table: ReturnType<typeof useProductTable<MigrationRun>>;
	columnCount: number;
	isLoading: boolean;
	onRowClick: (row: MigrationRun) => void;
}) {
	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columnCount,
				enableSorting: false,
				isLoading,
				rowClassName: "h-10 cursor-pointer",
				onRowClick,
				emptyStateText: "No runs yet. Trigger a dry run or run to see results.",
			}}
		>
			<Table.Toolbar>
				<Table.Heading>
					<ListIcon size={16} weight="fill" className="text-subtle" />
					Run History
				</Table.Heading>
			</Table.Toolbar>
			<Table.Container>
				<Table.Content>
					<Table.Header />
					<Table.Body />
				</Table.Content>
			</Table.Container>
		</Table.Provider>
	);
}

function ItemEventsTable({
	table,
	columnCount,
	isLoading,
	runId,
}: {
	table: ReturnType<typeof useProductTable<MigrationItemEvent>>;
	columnCount: number;
	isLoading: boolean;
	runId: string;
}) {
	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columnCount,
				enableSorting: false,
				isLoading,
				rowClassName: "h-10",
				emptyStateText: "No events recorded for this run",
			}}
		>
			<Table.Toolbar>
				<Table.Heading>
					<ListIcon size={16} className="text-subtle" />
					Item Events
					<span className="text-xs text-t3 font-mono ml-1">
						{runId.slice(0, 12)}...
					</span>
				</Table.Heading>
			</Table.Toolbar>
			<Table.Container>
				<Table.Content>
					<Table.Header />
					<Table.Body />
				</Table.Content>
			</Table.Container>
		</Table.Provider>
	);
}
