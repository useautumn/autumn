import type {
	ApiUsageLimit,
	AutoTopup,
	AutoTopupResponse,
	BillingControlKey,
	CustomerBillingControls,
	DbSpendLimit,
	DbUsageAlert,
	DbUsageLimit,
	UsageAlertBasis,
} from "@autumn/shared";
import { DEFAULT_USAGE_ALERT_BASIS } from "@autumn/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { CaretRightIcon, FunnelSimpleIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import { Fragment, type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/views/customers2/components/table/EmptyState";

type BillingControlItem = NonNullable<
	CustomerBillingControls[BillingControlKey]
>[number];

type ControlRef = { key: BillingControlKey; index: number };

type ControlLine = ControlRef & { item: BillingControlItem };

type FeatureLine =
	| { kind: "single"; control: ControlLine }
	| { kind: "alerts"; alerts: Array<ControlLine & { item: DbUsageAlert }> };

type FeatureCard = { featureId: string | undefined; lines: FeatureLine[] };

const KEY_ORDER: readonly BillingControlKey[] = [
	"usage_limits",
	"spend_limits",
	"usage_alerts",
	"overage_allowed",
	"auto_topups",
];

const LINE_LABELS: Record<BillingControlKey, string> = {
	usage_limits: "Usage limit",
	spend_limits: "Spend limit",
	usage_alerts: "Alerts",
	overage_allowed: "Overage",
	auto_topups: "Auto top-up",
};

const ALERT_BASIS_SHORT_LABELS: Record<UsageAlertBasis, string> = {
	balance: "Balance",
	included: "Plan allowance",
	recurring: "Recurring",
	usage_limit: "Limit cap",
};

const FILTER_VALUE_DISPLAY_LENGTH = 24;

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

const isControlEnabled = (item: BillingControlItem) =>
	!("enabled" in item) || item.enabled !== false;

const filterText = (filter?: { properties?: Record<string, unknown> }) => {
	const entries = Object.entries(filter?.properties ?? {});
	if (!entries.length) return null;
	return entries.map(([key, value]) => `${key} = ${value}`).join(", ");
};

const truncateFilterText = (text: string) =>
	text.length > FILTER_VALUE_DISPLAY_LENGTH
		? `${text.slice(0, FILTER_VALUE_DISPLAY_LENGTH - 1)}…`
		: text;

const alertThresholdLabel = (alert: DbUsageAlert) => {
	switch (alert.threshold_type) {
		case "usage_percentage":
			return `${alert.threshold}%`;
		case "remaining_percentage":
			return `${alert.threshold}% left`;
		case "remaining":
			return `${alert.threshold.toLocaleString()} left`;
		default:
			return alert.threshold.toLocaleString();
	}
};

const buildFeatureCards = ({
	billingControls,
	featureNameById,
}: {
	billingControls: CustomerBillingControls;
	featureNameById: Map<string, string>;
}): FeatureCard[] => {
	const cardsByFeature = new Map<string, FeatureCard>();
	const cardFor = (featureId: string | undefined) => {
		const cardKey = featureId ?? "";
		const existing = cardsByFeature.get(cardKey);
		if (existing) return existing;
		const card: FeatureCard = { featureId, lines: [] };
		cardsByFeature.set(cardKey, card);
		return card;
	};

	for (const key of KEY_ORDER) {
		const items = (billingControls[key] ?? []) as BillingControlItem[];
		items.forEach((item, index) => {
			const card = cardFor(item.feature_id);
			if (key !== "usage_alerts") {
				card.lines.push({ kind: "single", control: { key, index, item } });
				return;
			}
			const alertLine = card.lines.find((line) => line.kind === "alerts");
			const alert = { key, index, item: item as DbUsageAlert };
			if (alertLine?.kind === "alerts") alertLine.alerts.push(alert);
			else card.lines.push({ kind: "alerts", alerts: [alert] });
		});
	}

	const featureName = (card: FeatureCard) =>
		getFeatureLabel({ featureId: card.featureId, featureNameById });
	return [...cardsByFeature.values()].sort((left, right) => {
		if (!left.featureId) return -1;
		if (!right.featureId) return 1;
		return featureName(left).localeCompare(featureName(right));
	});
};

const OffPill = () => (
	<span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-tertiary-foreground">
		Off
	</span>
);

const Muted = ({ children }: { children: ReactNode }) => (
	<span className="text-tertiary-foreground">{children}</span>
);

const FilterNote = ({
	filter,
}: {
	filter?: { properties?: Record<string, unknown> };
}) => {
	const text = filterText(filter);
	if (!text) return null;
	return (
		<span title={text} className="text-tertiary-foreground">
			where {truncateFilterText(text)}
		</span>
	);
};

const UsageLimitSummary = ({
	usageLimit,
}: {
	usageLimit: ApiUsageLimit | DbUsageLimit;
}) => {
	const usage = "usage" in usageLimit ? usageLimit.usage : undefined;

	return (
		<>
			<span className="font-medium text-foreground">
				{usageLimit.limit.toLocaleString()} per {usageLimit.interval}
			</span>
			<FilterNote filter={usageLimit.filter} />
			{usage != null && (
				<Muted>
					· {usage.toLocaleString()} used this {usageLimit.interval}
				</Muted>
			)}
		</>
	);
};

const spendCapLabel = (spendLimit: DbSpendLimit) => {
	if (spendLimit.overage_limit === undefined) return "no overage cap";
	const cap =
		spendLimit.limit_type === "usage_percentage"
			? `${spendLimit.overage_limit.toLocaleString()}%`
			: spendLimit.overage_limit.toLocaleString();
	return `overage capped at ${cap}`;
};

const SpendLimitSummary = ({ spendLimit }: { spendLimit: DbSpendLimit }) => (
	<>
		<span className="font-medium text-foreground first-letter:uppercase">
			{spendCapLabel(spendLimit)}
		</span>
		{spendLimit.skip_overage_billing !== undefined && (
			<Muted>
				· overage {spendLimit.skip_overage_billing ? "not billed" : "billed"}
			</Muted>
		)}
	</>
);

const AutoTopupSummary = ({
	autoTopup,
}: {
	autoTopup: AutoTopup | AutoTopupResponse;
}) => {
	const purchaseLimit = autoTopup.purchase_limit;
	const hasExpandedLimit = purchaseLimit && "count" in purchaseLimit;
	const hasPurchaseLimit =
		purchaseLimit &&
		purchaseLimit.limit != null &&
		purchaseLimit.interval != null;

	return (
		<>
			<span className="font-medium text-foreground">
				Add {autoTopup.quantity.toLocaleString()} when below{" "}
				{autoTopup.threshold.toLocaleString()}
			</span>
			{hasPurchaseLimit && (
				<Muted>
					·{" "}
					{hasExpandedLimit
						? `${purchaseLimit.count}/${purchaseLimit.limit}`
						: purchaseLimit.limit}{" "}
					per {purchaseLimit.interval}
					{hasExpandedLimit && purchaseLimit.next_reset_at
						? `, resets ${format(new Date(purchaseLimit.next_reset_at), "MMM d")}`
						: ""}
				</Muted>
			)}
		</>
	);
};

const ControlSummary = ({ control }: { control: ControlLine }) => {
	switch (control.key) {
		case "usage_limits":
			return (
				<UsageLimitSummary
					usageLimit={control.item as ApiUsageLimit | DbUsageLimit}
				/>
			);
		case "spend_limits":
			return <SpendLimitSummary spendLimit={control.item as DbSpendLimit} />;
		case "auto_topups":
			return (
				<AutoTopupSummary
					autoTopup={control.item as AutoTopup | AutoTopupResponse}
				/>
			);
		case "overage_allowed":
			return <span className="font-medium text-foreground">Allowed</span>;
		default:
			return null;
	}
};

type ListCallbacks = {
	onEdit?: (args: ControlRef & { item: BillingControlItem }) => void;
	onOpenAlerts?: (args: { featureId: string | undefined }) => void;
	getRowBadge?: (args: ControlRef & { item: BillingControlItem }) => ReactNode;
	getAlertIcon?: (args: ControlRef & { item: DbUsageAlert }) => ReactNode;
};

const SubRow = ({
	label,
	slim,
	dimmed,
	trailing,
	onClick,
	children,
}: {
	label: string;
	slim: boolean;
	dimmed?: boolean;
	trailing?: ReactNode;
	onClick?: () => void;
	children: ReactNode;
}) => {
	const className = cn(
		"flex min-h-9 w-full min-w-0 items-center text-left text-sm",
		onClick && "cursor-pointer hover:bg-interactive-secondary-hover",
	);
	const content = (
		<>
			<span
				className={cn(
					"shrink-0 pr-2 text-xs text-tertiary-foreground",
					slim ? "w-36 pl-4" : "w-80 pl-[38px]",
				)}
			>
				{label}
			</span>
			<span
				className={cn(
					"flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5",
					dimmed && "opacity-60",
				)}
			>
				{children}
			</span>
			{trailing && (
				<span className="flex shrink-0 items-center gap-1.5 pr-4">
					{trailing}
				</span>
			)}
		</>
	);

	return onClick ? (
		<button type="button" className={className} onClick={onClick}>
			{content}
		</button>
	) : (
		<div className={className}>{content}</div>
	);
};

const AlertTag = ({
	alert,
	icon,
	onClick,
}: {
	alert: DbUsageAlert;
	icon?: ReactNode;
	onClick?: () => void;
}) => {
	const filter = filterText(alert.filter);
	const tooltip = [
		alert.name,
		filter && `Where ${filter}`,
		!alert.enabled && "Off",
	]
		.filter(Boolean)
		.join(" · ");
	const className = cn(
		"inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground",
		!alert.enabled && "opacity-50",
		onClick && "cursor-pointer hover:bg-muted/70",
	);
	const content = (
		<>
			{icon}
			{alertThresholdLabel(alert)}
			{filter && (
				<FunnelSimpleIcon className="size-3 text-tertiary-foreground" />
			)}
		</>
	);
	const tag = onClick ? (
		<button
			type="button"
			className={className}
			onClick={(event) => {
				event.stopPropagation();
				onClick();
			}}
		>
			{content}
		</button>
	) : (
		<span className={className}>{content}</span>
	);

	if (!tooltip) return tag;
	return (
		<Tooltip>
			<TooltipTrigger asChild>{tag}</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	);
};

const AlertTagGroups = ({
	alerts,
	getAlertIcon,
	onEditAlert,
}: {
	alerts: Array<ControlRef & { item: DbUsageAlert }>;
	getAlertIcon?: ListCallbacks["getAlertIcon"];
	onEditAlert?: (alert: ControlRef & { item: DbUsageAlert }) => void;
}) => {
	const alertsByBasis = new Map<UsageAlertBasis, typeof alerts>();
	for (const alert of alerts) {
		const basis = alert.item.basis ?? DEFAULT_USAGE_ALERT_BASIS;
		alertsByBasis.set(basis, [...(alertsByBasis.get(basis) ?? []), alert]);
	}

	return [...alertsByBasis.entries()].map(([basis, basisAlerts]) => (
		<span key={basis} className="flex shrink-0 items-center gap-1">
			<span className="mr-0.5 text-xs text-tertiary-foreground">
				{ALERT_BASIS_SHORT_LABELS[basis]}
			</span>
			{basisAlerts.map((alert) => (
				<AlertTag
					key={alert.index}
					alert={alert.item}
					icon={getAlertIcon?.(alert)}
					onClick={onEditAlert ? () => onEditAlert(alert) : undefined}
				/>
			))}
		</span>
	));
};

const AlertsLine = ({
	featureId,
	alerts,
	slim,
	badge,
	onEdit,
	onOpenAlerts,
	getAlertIcon,
}: {
	featureId: string | undefined;
	alerts: Array<ControlRef & { item: DbUsageAlert }>;
	slim: boolean;
	/** When every alert shares one source, the row badge replaces per-tag icons. */
	badge?: ReactNode;
} & ListCallbacks) => (
	<SubRow
		label={LINE_LABELS.usage_alerts}
		slim={slim}
		trailing={badge || undefined}
		onClick={onOpenAlerts ? () => onOpenAlerts({ featureId }) : undefined}
	>
		<AlertTagGroups
			alerts={alerts}
			getAlertIcon={badge ? undefined : getAlertIcon}
			onEditAlert={!onOpenAlerts ? onEdit : undefined}
		/>
	</SubRow>
);

const isEditingLine = ({
	line,
	editingRow,
}: {
	line: FeatureLine;
	editingRow?: ControlRef;
}) => {
	if (!editingRow) return false;
	if (line.kind === "single") {
		return (
			line.control.key === editingRow.key &&
			line.control.index === editingRow.index
		);
	}
	return line.alerts.some(
		(alert) => alert.key === editingRow.key && alert.index === editingRow.index,
	);
};

const COUNT_LABELS: Record<
	Exclude<BillingControlKey, "overage_allowed">,
	[string, string]
> = {
	usage_limits: ["usage limit", "usage limits"],
	spend_limits: ["spend limit", "spend limits"],
	usage_alerts: ["usage alert", "usage alerts"],
	auto_topups: ["auto top-up", "auto top-ups"],
};

const featureSummary = (card: FeatureCard) => {
	const counts = new Map<BillingControlKey, number>();
	for (const control of cardControls(card)) {
		counts.set(control.key, (counts.get(control.key) ?? 0) + 1);
	}
	return KEY_ORDER.flatMap((key) => {
		const count = counts.get(key);
		if (!count) return [];
		if (key === "overage_allowed") {
			const allowsOverage = cardControls(card).some(
				(control) =>
					control.key === "overage_allowed" && isControlEnabled(control.item),
			);
			return allowsOverage ? "overage allowed" : "overage not allowed";
		}
		const [singular, plural] = COUNT_LABELS[key];
		return `${count} ${count === 1 ? singular : plural}`;
	}).join(" · ");
};

const cardControls = (card: FeatureCard): ControlLine[] =>
	card.lines.flatMap((line) =>
		line.kind === "alerts" ? line.alerts : [line.control],
	);

const cardKey = (card: FeatureCard) => card.featureId ?? "all-features";

const FeatureRow = ({
	card,
	featureNameById,
	isExpanded,
	slim,
	onToggle,
	actions,
}: {
	card: FeatureCard;
	featureNameById: Map<string, string>;
	isExpanded: boolean;
	slim: boolean;
	onToggle: () => void;
	actions?: ReactNode;
}) => {
	const featureName = getFeatureLabel({
		featureId: card.featureId,
		featureNameById,
	});

	return (
		// biome-ignore lint/a11y/useSemanticElements: row holds a nested actions button
		<div
			role="button"
			tabIndex={0}
			className="flex h-10 w-full min-w-0 cursor-pointer items-center text-left text-sm hover:bg-interactive-secondary-hover"
			onClick={onToggle}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") onToggle();
			}}
		>
			<span
				className={cn(
					"flex shrink-0 items-center gap-2 pr-2 pl-4",
					slim ? "w-36" : "w-80",
				)}
			>
				<CaretRightIcon
					size={14}
					weight="bold"
					className={cn(
						"shrink-0 text-tertiary-foreground transition-transform duration-200",
						isExpanded && "rotate-90",
					)}
				/>
				<span
					title={featureName}
					className="truncate font-medium text-foreground"
				>
					{featureName}
				</span>
			</span>
			<span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-2">
				<span className="truncate text-tertiary-foreground">
					{featureSummary(card)}
				</span>
			</span>
			<span
				className="flex w-11 shrink-0 justify-center"
				onClick={(event) => event.stopPropagation()}
				onKeyDown={(event) => event.stopPropagation()}
			>
				{actions}
			</span>
		</div>
	);
};

export function BillingControlsList({
	billingControls,
	featureNameById,
	onEdit,
	onOpenAlerts,
	renderFeatureActions,
	editingRow,
	renderEditingRow,
	getRowBadge,
	getAlertIcon,
	getSharedSourceBadge,
	slim = false,
	defaultExpanded = false,
	emptyText = "No billing controls configured",
}: {
	billingControls?: CustomerBillingControls | null;
	featureNameById: Map<string, string>;
	/** When set, a feature's alerts row opens one view instead of editing each alert. */
	onOpenAlerts?: ListCallbacks["onOpenAlerts"];
	renderFeatureActions?: (args: { featureId: string | undefined }) => ReactNode;
	/** Badge for an alerts row whose alerts all share one source. */
	getSharedSourceBadge?: (args: { controls: ControlLine[] }) => ReactNode;
	editingRow?: ControlRef;
	renderEditingRow?: () => ReactNode;
	slim?: boolean;
	defaultExpanded?: boolean;
	emptyText?: string;
} & Omit<ListCallbacks, "onOpenAlerts">) {
	const [toggled, setToggled] = useState<Set<string>>(() => new Set());

	if (!billingControls || !hasBillingControls(billingControls)) {
		return <EmptyState className="h-12 min-h-0" text={emptyText} />;
	}

	const cards = buildFeatureCards({ billingControls, featureNameById });
	const toggle = (key: string) =>
		setToggled((previous) => {
			const next = new Set(previous);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	return (
		<div className="flex flex-col divide-y overflow-hidden rounded-lg border bg-interactive-secondary">
			{cards.map((card) => {
				const key = cardKey(card);
				const hasEditingLine =
					!!renderEditingRow &&
					card.lines.some((line) => isEditingLine({ line, editingRow }));
				const isExpanded =
					hasEditingLine || defaultExpanded !== toggled.has(key);

				return (
					<div key={key} className="flex flex-col">
						<FeatureRow
							card={card}
							featureNameById={featureNameById}
							isExpanded={isExpanded}
							slim={slim}
							onToggle={() => toggle(key)}
							actions={renderFeatureActions?.({ featureId: card.featureId })}
						/>
						{isExpanded && (
							<div className="flex flex-col border-t bg-card py-1">
								{card.lines.map((line) => {
									const lineKey =
										line.kind === "alerts"
											? "alerts"
											: `${line.control.key}-${line.control.index}`;
									const editing =
										renderEditingRow && isEditingLine({ line, editingRow });
									const badge =
										line.kind === "single" ? getRowBadge?.(line.control) : null;
									const isOff =
										line.kind === "single" &&
										!isControlEnabled(line.control.item);

									return (
										<Fragment key={lineKey}>
											{line.kind === "alerts" ? (
												<AlertsLine
													featureId={card.featureId}
													alerts={line.alerts}
													slim={slim}
													badge={getSharedSourceBadge?.({
														controls: line.alerts,
													})}
													onEdit={onEdit}
													onOpenAlerts={onOpenAlerts}
													getAlertIcon={getAlertIcon}
												/>
											) : (
												<SubRow
													label={LINE_LABELS[line.control.key]}
													slim={slim}
													dimmed={isOff}
													trailing={
														badge || isOff ? (
															<>
																{badge}
																{isOff && <OffPill />}
															</>
														) : undefined
													}
													onClick={
														onEdit ? () => onEdit(line.control) : undefined
													}
												>
													<ControlSummary control={line.control} />
												</SubRow>
											)}
											{editing && (
												<div className="px-2 py-1">{renderEditingRow()}</div>
											)}
										</Fragment>
									);
								})}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
