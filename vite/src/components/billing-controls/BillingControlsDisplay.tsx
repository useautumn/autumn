import type {
	ApiUsageLimit,
	AutoTopup,
	AutoTopupResponse,
	BillingControlKey,
	CustomerBillingControls,
	DbOverageAllowed,
	DbSpendLimit,
	DbUsageAlert,
	DbUsageLimit,
} from "@autumn/shared";
import {
	SectionTag,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { format } from "date-fns";
import { motion } from "motion/react";
import { createContext, Fragment, type ReactNode, useContext } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/views/customers2/components/table/EmptyState";

const ROW_SWAP_TRANSITION = {
	duration: 0.2,
	ease: [0.32, 0.72, 0, 1] as const,
};

const rowClassName =
	"flex flex-col justify-center gap-1 rounded-lg border px-3 py-2.5 min-w-0 transition-none bg-interactive-secondary";

const SlimContext = createContext(false);

type MetaEntry = { label: string; value: ReactNode };

const RowMeta = ({ entries }: { entries: MetaEntry[] }) => {
	const visible = entries.filter((entry) => entry.value != null);
	if (!visible.length) return null;

	return (
		<div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-tertiary-foreground">
			{visible.map((entry, index) => (
				<Fragment key={`${entry.label}-${index}`}>
					{index > 0 && <span className="text-tertiary-foreground/40">·</span>}
					<span className="whitespace-nowrap">
						{entry.label && (
							<span className="text-tertiary-foreground/70">
								{entry.label}{" "}
							</span>
						)}
						<span className="text-foreground/80">{entry.value}</span>
					</span>
				</Fragment>
			))}
		</div>
	);
};

type EditableRowProps<T> = {
	item: T;
	featureNameById: Map<string, string>;
	rowBadge?: ReactNode;
	onClick?: () => void;
};

export const getBillingControlsCount = (
	billingControls?: CustomerBillingControls | null,
) =>
	(billingControls?.auto_topups?.length ?? 0) +
	(billingControls?.spend_limits?.length ?? 0) +
	(billingControls?.usage_limits?.length ?? 0) +
	(billingControls?.usage_alerts?.length ?? 0) +
	(billingControls?.overage_allowed?.length ?? 0);

export const hasBillingControls = (
	billingControls?: CustomerBillingControls | null,
) => getBillingControlsCount(billingControls) > 0;

export function BillingControlsCountPill({
	billingControls,
}: {
	billingControls?: CustomerBillingControls | null;
}) {
	const count = getBillingControlsCount(billingControls);
	if (!count) return <span className="text-tertiary-foreground">—</span>;

	return (
		<span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-tertiary-foreground whitespace-nowrap">
			{count} {count === 1 ? "control" : "controls"}
		</span>
	);
}

export const getFeatureLabel = ({
	featureId,
	featureNameById,
}: {
	featureId?: string;
	featureNameById: Map<string, string>;
}) => {
	if (!featureId) return "All features";
	return featureNameById.get(featureId) ?? featureId;
};

const StatusPill = ({ enabled }: { enabled: boolean }) => (
	<span
		className={cn(
			"shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium",
			enabled
				? "bg-green-500/10 text-green-600"
				: "bg-muted text-tertiary-foreground",
		)}
	>
		{enabled ? "Enabled" : "Disabled"}
	</span>
);

const RowHeader = ({
	enabled,
	name,
	badge,
}: {
	enabled: boolean;
	name: string;
	badge?: ReactNode;
}) => (
	<div className="flex min-w-0 items-center gap-2">
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="truncate text-sm font-medium text-foreground">
					{name}
				</span>
			</TooltipTrigger>
			<TooltipContent>{name}</TooltipContent>
		</Tooltip>
		{badge}
		<div className="ml-auto shrink-0">
			<StatusPill enabled={enabled} />
		</div>
	</div>
);

export const BillingControlsGroup = ({
	title,
	count,
	children,
}: {
	title: string;
	count?: number;
	children: ReactNode;
}) => {
	const slim = useContext(SlimContext);
	const label = count == null ? title : `${title} · ${count}`;
	return (
		<div className="flex flex-col">
			{slim ? (
				<div className="mb-1.5 px-0.5 text-xs text-tertiary-foreground">
					{label}
				</div>
			) : (
				<SectionTag>{label}</SectionTag>
			)}
			{children}
		</div>
	);
};

const RowButton = ({
	children,
	enabled = true,
	onClick,
}: {
	children: ReactNode;
	enabled?: boolean;
	onClick?: () => void;
}) => {
	const dimClassName = enabled ? "" : "opacity-60";

	return onClick ? (
		<button
			type="button"
			className={cn(
				rowClassName,
				dimClassName,
				"w-full text-left cursor-pointer hover:bg-interactive-secondary-hover",
			)}
			onClick={onClick}
		>
			{children}
		</button>
	) : (
		<div className={cn(rowClassName, dimClassName)}>{children}</div>
	);
};

export const AutoTopupRow = ({
	item: autoTopup,
	featureNameById,
	rowBadge,
	onClick,
}: EditableRowProps<AutoTopup | AutoTopupResponse>) => {
	const purchaseLimit = autoTopup.purchase_limit;
	const hasExpandedLimit = purchaseLimit && "count" in purchaseLimit;
	const hasPurchaseLimit =
		purchaseLimit &&
		purchaseLimit.limit != null &&
		purchaseLimit.interval != null;

	return (
		<RowButton enabled={autoTopup.enabled} onClick={onClick}>
			<RowHeader
				enabled={autoTopup.enabled}
				name={getFeatureLabel({
					featureId: autoTopup.feature_id,
					featureNameById,
				})}
				badge={rowBadge}
			/>
			<RowMeta
				entries={[
					{ label: "Threshold", value: autoTopup.threshold.toLocaleString() },
					{ label: "Qty", value: autoTopup.quantity.toLocaleString() },
					{
						label: "Limit",
						value: hasPurchaseLimit
							? hasExpandedLimit
								? `${purchaseLimit.count}/${purchaseLimit.limit} per ${purchaseLimit.interval}`
								: `${purchaseLimit.limit} per ${purchaseLimit.interval}`
							: null,
					},
					{
						label: "Resets",
						value:
							hasExpandedLimit && purchaseLimit.next_reset_at
								? format(new Date(purchaseLimit.next_reset_at), "MMM d")
								: null,
					},
				]}
			/>
		</RowButton>
	);
};

export const SpendLimitRow = ({
	item: spendLimit,
	featureNameById,
	rowBadge,
	onClick,
}: EditableRowProps<DbSpendLimit>) => (
	<RowButton enabled={spendLimit.enabled} onClick={onClick}>
		<RowHeader
			enabled={spendLimit.enabled}
			name={getFeatureLabel({
				featureId: spendLimit.feature_id,
				featureNameById,
			})}
			badge={rowBadge}
		/>
		<RowMeta
			entries={[
				{
					label: "Overage limit",
					value:
						spendLimit.overage_limit === undefined
							? "none"
							: spendLimit.overage_limit.toLocaleString(),
				},
			]}
		/>
	</RowButton>
);

export const UsageLimitRow = ({
	item: usageLimit,
	featureNameById,
	rowBadge,
	onClick,
}: EditableRowProps<ApiUsageLimit | DbUsageLimit>) => {
	const usage = "usage" in usageLimit ? usageLimit.usage : undefined;
	const enabled = "enabled" in usageLimit ? usageLimit.enabled : true;
	return (
		<RowButton enabled={enabled} onClick={onClick}>
			<RowHeader
				enabled={enabled}
				name={getFeatureLabel({
					featureId: usageLimit.feature_id,
					featureNameById,
				})}
				badge={rowBadge}
			/>
			<RowMeta
				entries={[
					{
						label: "Limit",
						value: `${usageLimit.limit.toLocaleString()} / ${usageLimit.interval}`,
					},
					{
						label: "Usage",
						value:
							usage != null
								? `${usage.toLocaleString()} / ${usageLimit.limit.toLocaleString()} this ${usageLimit.interval}`
								: null,
					},
				]}
			/>
		</RowButton>
	);
};

export const UsageAlertRow = ({
	item: usageAlert,
	featureNameById,
	rowBadge,
	onClick,
}: EditableRowProps<DbUsageAlert>) => {
	const isPercentageType =
		usageAlert.threshold_type === "usage_percentage" ||
		usageAlert.threshold_type === "remaining_percentage";

	const thresholdLabel = isPercentageType
		? `${usageAlert.threshold}%`
		: usageAlert.threshold.toLocaleString();

	const thresholdTypeLabel: Record<string, string> = {
		usage: "Absolute usage",
		usage_percentage: "% used of allowance",
		remaining: "Absolute remaining",
		remaining_percentage: "% remaining of allowance",
	};

	return (
		<RowButton enabled={usageAlert.enabled} onClick={onClick}>
			<RowHeader
				enabled={usageAlert.enabled}
				name={getFeatureLabel({
					featureId: usageAlert.feature_id,
					featureNameById,
				})}
				badge={rowBadge}
			/>
			<RowMeta
				entries={[
					{ label: "At", value: thresholdLabel },
					{
						label: "Type",
						value: thresholdTypeLabel[usageAlert.threshold_type],
					},
					{ label: "Name", value: usageAlert.name || null },
				]}
			/>
		</RowButton>
	);
};

export const OverageAllowedRow = ({
	item: overageAllowed,
	featureNameById,
	rowBadge,
	onClick,
}: EditableRowProps<DbOverageAllowed>) => (
	<RowButton enabled={overageAllowed.enabled} onClick={onClick}>
		<RowHeader
			enabled={overageAllowed.enabled}
			name={getFeatureLabel({
				featureId: overageAllowed.feature_id,
				featureNameById,
			})}
			badge={rowBadge}
		/>
	</RowButton>
);

type BillingControlItem = NonNullable<
	CustomerBillingControls[BillingControlKey]
>[number];

type BillingControlGroupConfig = {
	key: BillingControlKey;
	title: string;
	Row: (props: EditableRowProps<BillingControlItem>) => ReactNode;
	getKey: (item: BillingControlItem, index: number) => string;
};

const BILLING_CONTROL_GROUPS: readonly BillingControlGroupConfig[] = [
	{
		key: "auto_topups",
		title: "Auto top-ups",
		Row: AutoTopupRow as BillingControlGroupConfig["Row"],
		getKey: (item, index) => `auto-topup-${item.feature_id}-${index}`,
	},
	{
		key: "spend_limits",
		title: "Spend limits",
		Row: SpendLimitRow as BillingControlGroupConfig["Row"],
		getKey: (item, index) =>
			`spend-limit-${item.feature_id ?? "global"}-${index}`,
	},
	{
		key: "usage_limits",
		title: "Usage limits",
		Row: UsageLimitRow as BillingControlGroupConfig["Row"],
		getKey: (item, index) => `usage-limit-${item.feature_id}-${index}`,
	},
	{
		key: "usage_alerts",
		title: "Usage alerts",
		Row: UsageAlertRow as BillingControlGroupConfig["Row"],
		getKey: (item, index) =>
			`usage-alert-${item.feature_id ?? "global"}-${item.name ?? index}`,
	},
	{
		key: "overage_allowed",
		title: "Overage allowed",
		Row: OverageAllowedRow as BillingControlGroupConfig["Row"],
		getKey: (item, index) => `overage-allowed-${item.feature_id}-${index}`,
	},
];

function BillingControlRowSlot({
	isEditing,
	editingContent,
	children,
}: {
	isEditing: boolean;
	editingContent?: () => ReactNode;
	children: ReactNode;
}) {
	return (
		<motion.div
			animate={{ height: "auto" }}
			transition={ROW_SWAP_TRANSITION}
			className="overflow-hidden"
		>
			{isEditing && editingContent ? editingContent() : children}
		</motion.div>
	);
}

export function BillingControlsList({
	billingControls,
	featureNameById,
	onEdit,
	editingRow,
	renderEditingRow,
	getRowBadge,
	slim = false,
	emptyText = "No billing controls configured",
}: {
	billingControls?: CustomerBillingControls | null;
	featureNameById: Map<string, string>;
	onEdit?: (args: {
		key: BillingControlKey;
		index: number;
		item: NonNullable<CustomerBillingControls[BillingControlKey]>[number];
	}) => void;
	editingRow?: { key: BillingControlKey; index: number };
	renderEditingRow?: () => ReactNode;
	getRowBadge?: (args: {
		key: BillingControlKey;
		item: BillingControlItem;
	}) => ReactNode;
	slim?: boolean;
	emptyText?: string;
}) {
	if (!hasBillingControls(billingControls)) {
		return <EmptyState className="h-12 min-h-0" text={emptyText} />;
	}

	return (
		<SlimContext.Provider value={slim}>
			<div className={cn("flex flex-col", slim ? "gap-2" : "gap-4")}>
				{BILLING_CONTROL_GROUPS.map(({ key, title, Row, getKey }) => {
					const items = billingControls?.[key];
					if (!items?.length) return null;

					return (
						<BillingControlsGroup key={key} title={title} count={items.length}>
							<div className="flex flex-col gap-2 rounded-lg">
								{items.map((item, index) => {
									const isEditing =
										editingRow?.key === key && editingRow.index === index;
									return (
										<BillingControlRowSlot
											key={getKey(item, index)}
											isEditing={Boolean(isEditing && renderEditingRow)}
											editingContent={renderEditingRow}
										>
											<Row
												item={item}
												featureNameById={featureNameById}
												rowBadge={getRowBadge?.({ key, item })}
												onClick={
													onEdit
														? () => onEdit({ key, index, item })
														: undefined
												}
											/>
										</BillingControlRowSlot>
									);
								})}
							</div>
						</BillingControlsGroup>
					);
				})}
			</div>
		</SlimContext.Provider>
	);
}
