import { Skeleton } from "@autumn/ui";
import {
	ColumnsIcon,
	FunnelSimpleIcon,
	type Icon,
	UsersIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

function OverviewRow({
	icon: RowIcon,
	label,
	children,
	action,
}: {
	icon: Icon;
	label: string;
	children: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="flex min-h-7 items-center gap-2">
			<div className="flex w-32 shrink-0 items-center gap-2">
				<RowIcon size={14} weight="bold" className="text-subtle" />
				<span className="text-tertiary-foreground text-sm">{label}</span>
			</div>
			<div className="min-w-0 flex-1 text-foreground text-sm">{children}</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</div>
	);
}

export function CustomerExportOverview({
	exportTotalCount,
	isCountLoading,
	isFilteredExport,
	columnsAction,
	scopeRow,
}: {
	exportTotalCount: number | undefined;
	isCountLoading: boolean;
	isFilteredExport: boolean;
	columnsAction: ReactNode;
	scopeRow?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<OverviewRow icon={UsersIcon} label="Customers">
				{isCountLoading ? (
					<Skeleton className="h-4 w-20 rounded" />
				) : (
					<span className="tabular-nums">
						{exportTotalCount === undefined
							? "All customers"
							: `${exportTotalCount.toLocaleString()} ${exportTotalCount === 1 ? "customer" : "customers"}`}
					</span>
				)}
			</OverviewRow>

			<OverviewRow icon={ColumnsIcon} label="Columns">
				{columnsAction}
			</OverviewRow>

			<OverviewRow icon={FunnelSimpleIcon} label="Scope" action={scopeRow}>
				<span className="text-tertiary-foreground">
					{isFilteredExport ? "Current search and filters" : "All customers"}
				</span>
			</OverviewRow>
		</div>
	);
}
