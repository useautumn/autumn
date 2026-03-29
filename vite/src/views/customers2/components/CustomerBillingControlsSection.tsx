import type {
	AutoTopup,
	DbSpendLimit,
	DbUsageAlert,
	Entity,
	Feature,
	FullCustomer,
} from "@autumn/shared";
import { FadersHorizontalIcon, GavelIcon } from "@phosphor-icons/react";
import { type ReactNode, useMemo } from "react";
import { Table } from "@/components/general/table";
import { SectionTag } from "@/components/v2/badges/SectionTag";
import { cn } from "@/lib/utils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "../customer/CustomerContext";
import { EmptyState } from "./table/EmptyState";

const pillClassName =
	"rounded-md bg-muted px-1.5 py-0.5 text-xs text-t3 whitespace-nowrap";
const rowClassName =
	"flex items-center gap-2 rounded-lg border bg-interactive-secondary h-12 px-3 min-w-0";

const getFeatureLabel = ({
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
			enabled ? "bg-green-500/10 text-green-600" : "bg-muted text-t3",
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

const BillingControlsGroup = ({
	title,
	children,
	emptyText,
	hasItems,
}: {
	title: string;
	children: ReactNode;
	emptyText: string;
	hasItems: boolean;
}) => (
	<div className="flex flex-col">
		<SectionTag>{title}</SectionTag>
		{hasItems ? (
			children
		) : (
			<EmptyState className="h-12 min-h-0" text={emptyText} />
		)}
	</div>
);

const AutoTopupRow = ({
	autoTopup,
	featureNameById,
}: {
	autoTopup: AutoTopup;
	featureNameById: Map<string, string>;
}) => {
	const purchaseLimit = autoTopup.purchase_limit;

	return (
		<div className={rowClassName}>
			<StatusPill enabled={autoTopup.enabled} />
			<span className="truncate text-sm text-t1 font-medium">
				{getFeatureLabel({
					featureId: autoTopup.feature_id,
					featureNameById,
				})}
			</span>
			<div className="ml-auto flex items-center gap-1.5 shrink-0">
				<Pill>Threshold: {autoTopup.threshold.toLocaleString()}</Pill>
				<Pill>Qty: {autoTopup.quantity.toLocaleString()}</Pill>
				{purchaseLimit && (
					<Pill className="hidden lg:inline">
						Limit: {purchaseLimit.limit}/{purchaseLimit.interval}
					</Pill>
				)}
			</div>
		</div>
	);
};

const SpendLimitRow = ({
	spendLimit,
	featureNameById,
}: {
	spendLimit: DbSpendLimit;
	featureNameById: Map<string, string>;
}) => (
	<div className={rowClassName}>
		<StatusPill enabled={spendLimit.enabled} />
		<span className="truncate text-sm text-t1 font-medium">
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
	</div>
);

const UsageAlertRow = ({
	usageAlert,
	featureNameById,
}: {
	usageAlert: DbUsageAlert;
	featureNameById: Map<string, string>;
}) => {
	const thresholdLabel =
		usageAlert.threshold_type === "usage_percentage"
			? `${usageAlert.threshold}%`
			: usageAlert.threshold.toLocaleString();

	return (
		<div className={rowClassName}>
			<StatusPill enabled={usageAlert.enabled} />
			<span className="truncate text-sm text-t1 font-medium">
				{getFeatureLabel({
					featureId: usageAlert.feature_id,
					featureNameById,
				})}
			</span>
			{usageAlert.name && (
				<span className="truncate text-xs text-t3 font-mono ml-4">{usageAlert.name}</span>
			)}
			<div className="ml-auto flex items-center gap-1.5 shrink-0">
				<Pill>At: {thresholdLabel}</Pill>
				<Pill className="hidden sm:inline">
					{usageAlert.threshold_type === "usage_percentage"
						? "% used of allowance"
						: "absolute usage"}
				</Pill>
			</div>
		</div>
	);
};

export function CustomerBillingControlsSection() {
	const { customer, features, isLoading } = useCusQuery();
	const { entityId } = useCustomerContext();

	const fullCustomer = customer as FullCustomer | undefined;

	const selectedEntity = useMemo(() => {
		if (!entityId) return null;

		return (
			fullCustomer?.entities.find(
				(entity: Entity) =>
					entity.id === entityId || entity.internal_id === entityId,
			) ?? null
		);
	}, [entityId, fullCustomer?.entities]);

	const featureNameById = useMemo(() => {
		return new Map(
			(features ?? []).map((feature: Feature) => [feature.id, feature.name]),
		);
	}, [features]);

	const autoTopups = selectedEntity ? [] : (fullCustomer?.auto_topups ?? []);
	const spendLimits = selectedEntity
		? (selectedEntity.spend_limits ?? [])
		: (fullCustomer?.spend_limits ?? []);
	const usageAlerts = selectedEntity
		? (selectedEntity.usage_alerts ?? [])
		: (fullCustomer?.usage_alerts ?? []);

	const hasAnyControls =
		autoTopups.length > 0 || spendLimits.length > 0 || usageAlerts.length > 0;

	const entitiesWithControlsCount =
		fullCustomer?.entities?.filter(
			(entity: Entity) =>
				(entity.spend_limits?.length ?? 0) > 0 ||
				(entity.usage_alerts?.length ?? 0) > 0,
		).length ?? 0;

	if (!isLoading && !hasAnyControls && selectedEntity) return null;

	const customerEmptyText =
		entitiesWithControlsCount > 0
			? `No customer-level billing controls — billing controls exist on ${entitiesWithControlsCount} ${entitiesWithControlsCount === 1 ? "entity" : "entities"}`
			: "No billing controls configured";

	return (
		<Table.Container>
			<Table.Toolbar>
				<Table.Heading>
					<GavelIcon
						size={16}
						weight="fill"
						className="text-subtle"
					/>
					Billing controls
				</Table.Heading>
			</Table.Toolbar>

			{isLoading ? (
				<EmptyState text="Loading billing controls" />
			) : !hasAnyControls ? (
				<EmptyState text={customerEmptyText} />
			) : (
				<div className="flex flex-col gap-4">
					{autoTopups.length > 0 && (
						<BillingControlsGroup
							title="Auto top-ups"
							emptyText=""
							hasItems
						>
							<div className="flex flex-col gap-1.5">
								{autoTopups.map((autoTopup) => (
									<AutoTopupRow
										key={`auto-topup-${autoTopup.feature_id}`}
										autoTopup={autoTopup}
										featureNameById={featureNameById}
									/>
								))}
							</div>
						</BillingControlsGroup>
					)}

					{spendLimits.length > 0 && (
						<BillingControlsGroup
							title="Spend limits"
							emptyText=""
							hasItems
						>
							<div className="flex flex-col gap-1.5">
								{spendLimits.map((spendLimit, index) => (
									<SpendLimitRow
										key={`spend-limit-${spendLimit.feature_id ?? "global"}-${index}`}
										spendLimit={spendLimit}
										featureNameById={featureNameById}
									/>
								))}
							</div>
						</BillingControlsGroup>
					)}

					{usageAlerts.length > 0 && (
						<BillingControlsGroup
							title="Usage alerts"
							emptyText=""
							hasItems
						>
							<div className="flex flex-col gap-1.5">
								{usageAlerts.map((usageAlert, index) => (
									<UsageAlertRow
										key={`usage-alert-${usageAlert.feature_id ?? "global"}-${usageAlert.name ?? index}`}
										usageAlert={usageAlert}
										featureNameById={featureNameById}
									/>
								))}
							</div>
						</BillingControlsGroup>
					)}
				</div>
			)}
		</Table.Container>
	);
}
