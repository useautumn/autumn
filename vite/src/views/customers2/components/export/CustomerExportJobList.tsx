import {
	CUSTOMER_EXPORT_FIELD_HEADERS,
	type CustomerExportResponse,
	type Membership,
} from "@autumn/shared";
import { Badge, Button, Skeleton } from "@autumn/ui";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import { useMemberships } from "@/views/main-sidebar/org-dropdown/hooks/useMemberships";
import {
	isCustomerExportActive,
	useDownloadCustomerExport,
} from "../../hooks/useCustomerExports";
import { CustomerExportCardField } from "./CustomerExportCardField";
import { CustomerExportProgressRow } from "./CustomerExportProgressRow";
import { CustomerExportStatusBadge } from "./CustomerExportStatusBadge";

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
	const requesterLabels = buildRequesterLabels({ memberships });

	if (isLoading && customerExports.length === 0) {
		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-32 w-full rounded-lg" />
				<Skeleton className="h-32 w-full rounded-lg" />
			</div>
		);
	}

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

	if (customerExports.length === 0) {
		return (
			<div className="rounded-lg border border-border border-dashed px-4 py-6 text-center text-sm text-tertiary-foreground">
				No exports yet.
			</div>
		);
	}

	return (
		<ul className="flex flex-col gap-3">
			{customerExports.map((customerExport) => {
				const createdAtLabel = formatUnixToDateTimeString(
					customerExport.created_at,
				);
				const requestedByUserId = customerExport.requested_by_user_id;
				const requesterLabel = requestedByUserId
					? (requesterLabels.get(requestedByUserId) ?? requestedByUserId)
					: NO_REQUESTER_LABEL;

				return (
					<li
						key={customerExport.id}
						className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="flex min-w-0 items-center gap-2">
								<CustomerExportStatusBadge status={customerExport.status} />
								<span className="truncate text-foreground text-sm">
									{createdAtLabel}
								</span>
							</div>

							{customerExport.status === "completed" ? (
								<Button
									variant="secondary"
									size="sm"
									type="button"
									className="shrink-0"
									aria-label={`Download export from ${createdAtLabel}`}
									isLoading={
										download.isPending &&
										download.variables?.exportId === customerExport.id
									}
									onClick={() =>
										download.mutate({ exportId: customerExport.id })
									}
								>
									Download
								</Button>
							) : null}
						</div>

						{isCustomerExportActive(customerExport) &&
						customerExport.progress ? (
							<CustomerExportProgressRow progress={customerExport.progress} />
						) : null}

						<CustomerExportCardField label="Requested by">
							<span className="block wrap-break-word text-foreground text-sm">
								{requesterLabel}
							</span>
						</CustomerExportCardField>

						<CustomerExportCardField
							label={`Columns (${customerExport.fields.length})`}
						>
							<div className="flex flex-wrap gap-1">
								{customerExport.fields.map((field) => (
									<Badge key={field} variant="muted" size="sm">
										{CUSTOMER_EXPORT_FIELD_HEADERS[field]}
									</Badge>
								))}
							</div>
						</CustomerExportCardField>

						{customerExport.row_count !== null ? (
							<CustomerExportCardField label="Rows">
								<span className="block text-foreground text-sm">
									{customerExport.row_count.toLocaleString()}
								</span>
							</CustomerExportCardField>
						) : null}

						{customerExport.status === "failed" ||
						customerExport.error_message ? (
							<div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
								{customerExport.error_message ??
									"Export failed — you can start a new one."}
							</div>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}
