import {
	type CustomerExportResponse,
	isCustomerExportActive,
} from "@autumn/shared";
import { ConditionalTooltip, IconButton } from "@autumn/ui";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import { CustomerExportProgressRow } from "./CustomerExportProgressRow";
import { CustomerExportStatusBadge } from "./CustomerExportStatusBadge";

const FAILED_FALLBACK_MESSAGE = "Export failed — you can start a new one.";

export const createCustomerExportColumns = ({
	requesterLabels,
	noRequesterLabel,
	downloadingExportId,
	onDownload,
}: {
	requesterLabels: Map<string, string>;
	noRequesterLabel: string;
	downloadingExportId: string | undefined;
	onDownload: (exportId: string) => void;
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

			if (isCustomerExportActive(customerExport) && customerExport.progress) {
				return (
					<div className="flex flex-col gap-1">
						<CustomerExportStatusBadge status={customerExport.status} />
						<CustomerExportProgressRow progress={customerExport.progress} />
					</div>
				);
			}

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
	{
		header: "Requested by",
		id: "requested_by",
		cell: ({ row }: { row: Row<CustomerExportResponse> }) => {
			const requestedByUserId = row.original.requested_by_user_id;
			const label = requestedByUserId
				? (requesterLabels.get(requestedByUserId) ?? requestedByUserId)
				: noRequesterLabel;

			return (
				<ConditionalTooltip
					enabled={Boolean(requestedByUserId)}
					content={label}
				>
					<span className="block cursor-default truncate text-tertiary-foreground">
						{label}
					</span>
				</ConditionalTooltip>
			);
		},
	},
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
