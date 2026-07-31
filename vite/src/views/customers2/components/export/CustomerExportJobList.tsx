import {
	CUSTOMER_EXPORT_FIELD_HEADERS,
	type CustomerExportResponse,
	type Membership,
} from "@autumn/shared";
import { Badge, Button } from "@autumn/ui";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import { useMemberships } from "@/views/main-sidebar/org-dropdown/hooks/useMemberships";
import { useDownloadCustomerExport } from "../../hooks/useCustomerExports";

const STATUS_LABELS: Record<CustomerExportResponse["status"], string> = {
	queued: "Queued",
	running: "Running",
	completed: "Completed",
	failed: "Failed",
};

const statusVariant = (status: CustomerExportResponse["status"]) => {
	if (status === "completed") return "default" as const;
	if (status === "failed") return "destructive" as const;
	return "secondary" as const;
};

const useRequesterLabel = () => {
	const { memberships } = useMemberships();

	return ({ userId }: { userId: string | null }) => {
		if (!userId) return "—";
		const membership = (memberships as Membership[]).find(
			(candidate) => candidate.user?.id === userId,
		);
		return membership?.user?.email ?? membership?.user?.name ?? userId;
	};
};

export function CustomerExportJobList({
	customerExports,
	isLoading,
}: {
	customerExports: CustomerExportResponse[];
	isLoading: boolean;
}) {
	const download = useDownloadCustomerExport();
	const requesterLabel = useRequesterLabel();

	if (isLoading && customerExports.length === 0) {
		return <p className="text-muted-foreground text-sm">Loading exports…</p>;
	}

	if (customerExports.length === 0) {
		return <p className="text-muted-foreground text-sm">No exports yet.</p>;
	}

	return (
		<ul className="flex flex-col divide-y">
			{customerExports.map((customerExport) => (
				<li
					key={customerExport.id}
					className="flex items-start justify-between gap-3 py-3"
				>
					<div className="flex min-w-0 flex-col gap-1">
						<div className="flex items-center gap-2">
							<Badge variant={statusVariant(customerExport.status)}>
								{STATUS_LABELS[customerExport.status]}
							</Badge>
							<span className="text-sm">
								{formatUnixToDateTimeString(customerExport.created_at)}
							</span>
						</div>
						<span className="truncate text-muted-foreground text-xs">
							{requesterLabel({ userId: customerExport.requested_by_user_id })}
						</span>
						<span className="truncate text-muted-foreground text-xs">
							{customerExport.fields
								.map((field) => CUSTOMER_EXPORT_FIELD_HEADERS[field])
								.join(", ")}
						</span>
						{customerExport.row_count !== null ? (
							<span className="text-muted-foreground text-xs">
								{customerExport.row_count.toLocaleString()} rows
							</span>
						) : null}
						{customerExport.error_message ? (
							<span className="text-destructive text-xs">
								{customerExport.error_message}
							</span>
						) : null}
					</div>

					{customerExport.status === "completed" ? (
						<Button
							variant="secondary"
							size="sm"
							type="button"
							isLoading={
								download.isPending &&
								download.variables?.exportId === customerExport.id
							}
							onClick={() => download.mutate({ exportId: customerExport.id })}
						>
							Download
						</Button>
					) : null}
				</li>
			))}
		</ul>
	);
}
