import type { CustomerExportResponse, Membership } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { useMemberships } from "@/views/main-sidebar/org-dropdown/hooks/useMemberships";
import { useDownloadCustomerExport } from "../../hooks/useCustomerExports";
import { createCustomerExportColumns } from "./CustomerExportColumns";

const buildRequesterLabels = ({
	memberships,
}: {
	memberships: Membership[];
}) => {
	const labels = new Map<string, string>();
	for (const { user } of memberships) {
		if (!user?.id) continue;
		labels.set(user.id, user.email ?? user.name ?? user.id);
	}
	return labels;
};

const NO_REQUESTER_LABEL = "—";

export function CustomerExportJobList({
	customerExports,
	isLoading,
	isInitialError,
	isRetrying,
	onRetry,
}: {
	customerExports: CustomerExportResponse[];
	isLoading: boolean;
	isInitialError: boolean;
	isRetrying: boolean;
	onRetry: () => void;
}) {
	const download = useDownloadCustomerExport();
	const memberships: Membership[] = useMemberships().memberships;
	const downloadingExportId = download.isPending
		? download.variables?.exportId
		: undefined;
	const downloadMutate = download.mutate;

	const requesterLabels = useMemo(
		() => buildRequesterLabels({ memberships }),
		[memberships],
	);

	const columns = useMemo(
		() =>
			createCustomerExportColumns({
				requesterLabels,
				noRequesterLabel: NO_REQUESTER_LABEL,
				downloadingExportId,
				onDownload: (exportId) => downloadMutate({ exportId }),
			}),
		[requesterLabels, downloadingExportId, downloadMutate],
	);

	const table = useReactTable({
		data: customerExports,
		columns,
		getCoreRowModel: getCoreRowModel(),
		enableSorting: false,
		getRowId: (row) => row.id,
	});

	if (isInitialError && customerExports.length === 0) {
		return (
			<div className="flex flex-col items-center gap-3 rounded-lg border border-border border-dashed px-4 py-6 text-center">
				<p className="text-sm text-tertiary-foreground">
					Couldn&apos;t load recent exports.
				</p>
				<Button
					variant="secondary"
					size="sm"
					type="button"
					isLoading={isRetrying}
					onClick={() => onRetry()}
				>
					Try again
				</Button>
			</div>
		);
	}

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length,
				enableSorting: false,
				isLoading: isLoading && customerExports.length === 0,
				emptyStateText: "No exports yet",
				flexibleTableColumns: true,
			}}
		>
			<Table.Container className="min-h-0 flex-1 overflow-y-auto">
				<Table.Content>
					<Table.Header />
					<Table.Body />
				</Table.Content>
			</Table.Container>
		</Table.Provider>
	);
}
