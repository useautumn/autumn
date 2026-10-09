import {
	CustomerExportKind,
	type CustomerExportResponse,
} from "@autumn/shared";
import { ConditionalTooltip, IconButton } from "@autumn/ui";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import { CustomerExportModeBadge } from "./CustomerExportModeBadge";
import { CustomerExportStatusBadge } from "./CustomerExportStatusBadge";

const FAILED_FALLBACK_MESSAGE = "Export failed — you can start a new one.";

const isApplyRun = (customerExport: CustomerExportResponse) =>
	customerExport.kind === CustomerExportKind.CustomPlans &&
	customerExport.snapshot.apply;

const modeColumn: ColumnDef<CustomerExportResponse, unknown> = {
	header: "Mode",
	id: "mode",
	size: 120,
	cell: ({ row }: { row: Row<CustomerExportResponse> }) => (
		<CustomerExportModeBadge applied={isApplyRun(row.original)} />
	),
};

export const createCustomerExportColumns = ({
	downloadingExportId,
	onDownload,
	showMode = false,
}: {
	downloadingExportId: string | undefined;
	onDownload: (exportId: string) => void;
	/** Custom plans runs either apply or only report, so their list shows which. */
	showMode?: boolean;
}): ColumnDef<CustomerExportResponse, unknown>[] => [
	{
		header: "Status",
		id: "status",
		size: 150,
		cell: ({ row }: { row: Row<CustomerExportResponse> }) => {
			const customerExport = row.original;
			const errorMessage =
				customerExport.status === "failed"
					? (customerExport.error_message ?? FAILED_FALLBACK_MESSAGE)
					: customerExport.error_message;

			if (!errorMessage) {
				return <CustomerExportStatusBadge status={customerExport.status} />;
			}

			return (
				<ConditionalTooltip enabled content={errorMessage}>
					<span className="inline-flex cursor-default">
						<CustomerExportStatusBadge status={customerExport.status} />
					</span>
				</ConditionalTooltip>
			);
		},
	},
	{
		header: "Started",
		id: "created_at",
		cell: ({ row }: { row: Row<CustomerExportResponse> }) => (
			<span className="truncate text-foreground">
				{formatUnixToDateTimeString(row.original.created_at)}
			</span>
		),
	},
	...(showMode ? [modeColumn] : []),
	{
		header: "Rows",
		id: "row_count",
		size: 70,
		cell: ({ row }: { row: Row<CustomerExportResponse> }) => (
			<span className="text-tertiary-foreground tabular-nums">
				{row.original.row_count === null
					? "—"
					: row.original.row_count.toLocaleString()}
			</span>
		),
	},
	{
		header: "",
		id: "actions",
		size: 44,
		cell: ({ row }: { row: Row<CustomerExportResponse> }) => {
			const customerExport = row.original;
			if (customerExport.status !== "completed") return null;

			return (
				<ConditionalTooltip enabled content="Download CSV">
					<IconButton
						variant="secondary"
						size="sm"
						type="button"
						iconOrientation="center"
						aria-label={`Download export from ${formatUnixToDateTimeString(customerExport.created_at)}`}
						isLoading={downloadingExportId === customerExport.id}
						icon={<DownloadSimpleIcon />}
						onClick={() => onDownload(customerExport.id)}
					/>
				</ConditionalTooltip>
			);
		},
	},
];
