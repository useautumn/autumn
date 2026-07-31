import {
	CUSTOMER_EXPORT_FIELD_HEADERS,
	type CustomerExportProgress,
	type CustomerExportResponse,
	type Membership,
} from "@autumn/shared";
import { Badge, Button, Progress, Skeleton } from "@autumn/ui";
import {
	CheckCircleIcon,
	ClockClockwiseIcon,
	type Icon,
	SpinnerIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import { useMemberships } from "@/views/main-sidebar/org-dropdown/hooks/useMemberships";
import {
	isCustomerExportActive,
	useDownloadCustomerExport,
} from "../../hooks/useCustomerExports";

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

const PERCENT_MAX = 100;

const progressToPercent = (progress: CustomerExportProgress) =>
	progress.total_rows === 0
		? PERCENT_MAX
		: Math.min(
				PERCENT_MAX,
				Math.round(
					(progress.processed_rows / progress.total_rows) * PERCENT_MAX,
				),
			);

function CustomerExportProgressRow({
	progress,
}: {
	progress: CustomerExportProgress;
}) {
	const percent = progressToPercent(progress);

	return (
		<div className="flex items-center gap-2">
			<Progress
				className="flex-1"
				value={percent}
				aria-label="Export progress"
			/>
			<span className="shrink-0 text-tertiary-foreground text-xs tabular-nums">
				{percent}%
			</span>
		</div>
	);
}

function CustomerExportCardField({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<span className="block font-medium text-tertiary-foreground text-xs">
				{label}
			</span>
			{children}
		</div>
	);
}

const useRequesterLabelsByUserId = () => {
	const { memberships } = useMemberships();

	return useMemo(() => {
		const labels = new Map<string, string>();
		for (const { user } of memberships as Membership[]) {
			if (!user?.id) continue;
			labels.set(user.id, user.email ?? user.name ?? user.id);
		}
		return labels;
	}, [memberships]);
};

const NO_REQUESTER_LABEL = "—";

export function CustomerExportJobList({
	customerExports,
	isLoading,
}: {
	customerExports: CustomerExportResponse[];
	isLoading: boolean;
}) {
	const download = useDownloadCustomerExport();
	const requesterLabels = useRequesterLabelsByUserId();

	if (isLoading && customerExports.length === 0) {
		return (
			<div className="space-y-3">
				<Skeleton className="h-32 w-full rounded-lg" />
				<Skeleton className="h-32 w-full rounded-lg" />
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
		<ul className="space-y-3">
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
						className="space-y-3 rounded-lg border border-border bg-card p-4"
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
