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
import { Button, SectionTag } from "@autumn/ui";
import { format } from "date-fns";
import { motion } from "motion/react";
import { createContext, type ReactNode, useContext } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/views/customers2/components/table/EmptyState";

const ROW_SWAP_TRANSITION = {
	duration: 0.2,
	ease: [0.32, 0.72, 0, 1] as const,
};

const pillClassName =
	"rounded-md bg-muted px-1.5 py-0.5 text-xs text-tertiary-foreground whitespace-nowrap";
const rowClassName =
	"flex items-center gap-2 rounded-lg border px-3 min-w-0 transition-none bg-interactive-secondary";

const SlimContext = createContext(false);

type EditableRowProps<T> = {
	item: T;
	featureNameById: Map<string, string>;
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

const Pill = ({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) => <span className={cn(pillClassName, className)}>{children}</span>;

export const BillingControlsGroup = ({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) => {
	const slim = useContext(SlimContext);
	return (
		<div className="flex flex-col">
			{slim ? (
				<div className="mb-1.5 px-0.5 text-xs text-tertiary-foreground">
					{title}
				</div>
			) : (
				<SectionTag>{title}</SectionTag>
			)}
			{children}
		</div>
	);
};

const RowButton = ({
	children,
	onClick,
}: {
	children: ReactNode;
	onClick?: () => void;
}) => {
	const slim = useContext(SlimContext);
	const heightClassName = slim ? "h-9" : "h-12";

	return onClick ? (
		<Button
			type="button"
			variant="ghost"
			className={cn(
				rowClassName,
				heightClassName,
				"w-full justify-start hover:bg-interactive-secondary-hover",
			)}
			onClick={onClick}
		>
			{children}
		</Button>
	) : (
		<div className={cn(rowClassName, heightClassName)}>{children}</div>
	);
};

export const AutoTopupRow = ({
	item: autoTopup,
	featureNameById,
	onClick,
}: EditableRowProps<AutoTopup | AutoTopupResponse>) => {
	const purchaseLimit = autoTopup.purchase_limit;
	const hasExpandedLimit = purchaseLimit && "count" in purchaseLimit;

	return (
		<RowButton onClick={onClick}>
			<StatusPill enabled={autoTopup.enabled} />
			<span className="truncate text-sm text-foreground font-medium">
				{getFeatureLabel({
					featureId: autoTopup.feature_id,
					featureNameById,
				})}
			</span>
			<div className="ml-auto flex items-center gap-1.5 shrink-0">
				<Pill>Threshold: {autoTopup.threshold.toLocaleString()}</Pill>
				<Pill>Qty: {autoTopup.quantity.toLocaleString()}</Pill>
				{purchaseLimit &&
					purchaseLimit.limit != null &&
					purchaseLimit.interval != null && (
						<Pill className="hidden lg:inline">
							{hasExpandedLimit
								? `${purchaseLimit.count}/${purchaseLimit.limit} per ${purchaseLimit.interval}`
								: `Limit: ${purchaseLimit.limit} per ${purchaseLimit.interval}`}
						</Pill>
					)}
				{hasExpandedLimit && purchaseLimit.next_reset_at && (
					<Pill className="hidden xl:inline">
						Resets {format(new Date(purchaseLimit.next_reset_at), "MMM d")}
					</Pill>
				)}
			</div>
		</RowButton>
	);
};

export const SpendLimitRow = ({
	item: spendLimit,
	featureNameById,
	onClick,
}: EditableRowProps<DbSpendLimit>) => (
	<RowButton onClick={onClick}>
		<StatusPill enabled={spendLimit.enabled} />
		<span className="truncate text-sm text-foreground font-medium">
			{getFeatureLabel({
				featureId: spendLimit.feature_id,
				featureNameById,
			})}
		</span>
		<div className="ml-auto flex items-center gap-1.5 shrink-0">
			<Pill>
				Overage limit:{" "}
				{spendLimit.overage_limit === undefined
					? "none"
					: spendLimit.overage_limit.toLocaleString()}
			</Pill>
		</div>
	</RowButton>
);

export const UsageLimitRow = ({
	item: usageLimit,
	featureNameById,
	onClick,
}: EditableRowProps<ApiUsageLimit | DbUsageLimit>) => {
	const usage = "usage" in usageLimit ? usageLimit.usage : undefined;
	return (
		<RowButton onClick={onClick}>
			<StatusPill
				enabled={"enabled" in usageLimit ? usageLimit.enabled : true}
			/>
			<span className="truncate text-sm text-foreground font-medium">
				{getFeatureLabel({
					featureId: usageLimit.feature_id,
					featureNameById,
				})}
			</span>
			<div className="ml-auto flex items-center gap-1.5 shrink-0">
				{usage != null && (
					<Pill>
						{`${usage.toLocaleString()} / ${usageLimit.limit.toLocaleString()} this ${usageLimit.interval}`}
					</Pill>
				)}
				<Pill>
					Usage limit:{" "}
					{`${usageLimit.limit.toLocaleString()} / ${usageLimit.interval}`}
				</Pill>
			</div>
		</RowButton>
	);
};

export const UsageAlertRow = ({
	item: usageAlert,
	featureNameById,
	onClick,
}: EditableRowProps<DbUsageAlert>) => {
	const isPercentageType =
		usageAlert.threshold_type === "usage_percentage" ||
		usageAlert.threshold_type === "remaining_percentage";

	const thresholdLabel = isPercentageType
		? `${usageAlert.threshold}%`
		: usageAlert.threshold.toLocaleString();

	const thresholdTypeLabel: Record<string, string> = {
		usage: "absolute usage",
		usage_percentage: "% used of allowance",
		remaining: "absolute remaining",
		remaining_percentage: "% remaining of allowance",
	};

	return (
		<RowButton onClick={onClick}>
			<StatusPill enabled={usageAlert.enabled} />
			<span className="truncate text-sm text-foreground font-medium">
				{getFeatureLabel({
					featureId: usageAlert.feature_id,
					featureNameById,
				})}
			</span>
			{usageAlert.name && (
				<span className="truncate text-xs text-tertiary-foreground font-mono ml-4">
					{usageAlert.name}
				</span>
			)}
			<div className="ml-auto flex items-center gap-1.5 shrink-0">
				<Pill>At: {thresholdLabel}</Pill>
				<Pill className="hidden sm:inline">
					{thresholdTypeLabel[usageAlert.threshold_type]}
				</Pill>
			</div>
		</RowButton>
	);
};

export const OverageAllowedRow = ({
	item: overageAllowed,
	featureNameById,
	onClick,
}: EditableRowProps<DbOverageAllowed>) => (
	<RowButton onClick={onClick}>
		<StatusPill enabled={overageAllowed.enabled} />
		<span className="truncate text-sm text-foreground font-medium">
			{getFeatureLabel({
				featureId: overageAllowed.feature_id,
				featureNameById,
			})}
		</span>
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
						<BillingControlsGroup key={key} title={title}>
							<div className="flex flex-col gap-1.5 rounded-lg">
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
