import {
	CUSTOMER_EXPORT_FIELD_HEADERS,
	type CustomerExportResponse,
	type Membership,
} from "@autumn/shared";
import { Badge, Button, Skeleton } from "@autumn/ui";
import {
	CheckCircleIcon,
	ClockClockwiseIcon,
	type Icon,
	SpinnerIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import { useMemberships } from "@/views/main-sidebar/org-dropdown/hooks/useMemberships";
import { useDownloadCustomerExport } from "../../hooks/useCustomerExports";

const STATUS_CONFIG = {
	queued: {
		label: "Queued",
		icon: ClockClockwiseIcon,
		className: "bg-muted text-tertiary-foreground border-border/50",
		iconClassName: "",
	},
	running: {
		label: "Running",
		icon: SpinnerIcon,
		className: "bg-amber-500/10 text-amber-500 border-transparent",
		iconClassName: "animate-spin",
	},
	completed: {
		label: "Completed",
		icon: CheckCircleIcon,
		className: "bg-green-500/10 text-green-500 border-transparent",
		iconClassName: "",
	},
	failed: {
		label: "Failed",
		icon: XCircleIcon,
		className: "bg-red-500/10 text-red-500 border-transparent",
		iconClassName: "",
	},
} satisfies Record<
	CustomerExportResponse["status"],
	{ label: string; icon: Icon; className: string; iconClassName: string }
>;

function CustomerExportStatusBadge({
	status,
}: {
	status: CustomerExportResponse["status"];
}) {
	const config = STATUS_CONFIG[status];
	const StatusIcon = config.icon;

	return (
		<Badge variant="muted" size="sm" className={cn("gap-1", config.className)}>
			<StatusIcon size={11} weight="fill" className={config.iconClassName} />
			{config.label}
		</Badge>
	);
}

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
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-14 w-full rounded-lg" />
				<Skeleton className="h-14 w-full rounded-lg" />
			</div>
		);
	}

	if (customerExports.length === 0) {
		return (
			<div className="py-1 text-tertiary-foreground text-sm">
				No exports yet.
			</div>
		);
	}

	return (
		<ul className="flex flex-col gap-0.5">
			{customerExports.map((customerExport) => (
				<li
					key={customerExport.id}
					className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-interactive-secondary/50"
				>
					<div className="flex min-w-0 flex-col gap-1">
						<div className="flex items-center gap-2">
							<CustomerExportStatusBadge status={customerExport.status} />
							<span className="text-body text-foreground">
								{formatUnixToDateTimeString(customerExport.created_at)}
							</span>
						</div>
						<span className="truncate text-tertiary-foreground text-tiny">
							{requesterLabel({ userId: customerExport.requested_by_user_id })}
						</span>
						<span className="truncate text-tertiary-foreground text-tiny">
							{customerExport.fields
								.map((field) => CUSTOMER_EXPORT_FIELD_HEADERS[field])
								.join(", ")}
						</span>
						{customerExport.row_count !== null ? (
							<span className="text-tertiary-foreground text-tiny">
								{customerExport.row_count.toLocaleString()} rows
							</span>
						) : null}
						{customerExport.error_message ? (
							<span className="text-destructive text-tiny">
								{customerExport.error_message}
							</span>
						) : null}
					</div>

					{customerExport.status === "completed" ? (
						<Button
							variant="secondary"
							size="sm"
							type="button"
							className="shrink-0"
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
