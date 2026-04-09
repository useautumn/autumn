import {
	ACTIVE_STATUSES,
	type AutoTopup,
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	type DbOverageAllowed,
	type DbSpendLimit,
	type DbUsageAlert,
	type Entity,
	type Feature,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	nullish,
} from "@autumn/shared";
import { GavelIcon, PlusIcon } from "@phosphor-icons/react";
import { type ReactNode, useMemo } from "react";
import { Table } from "@/components/general/table";
import { SectionTag } from "@/components/v2/badges/SectionTag";
import { Button } from "@/components/v2/buttons/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "../customer/CustomerContext";
import { EmptyState } from "./table/EmptyState";

const pillClassName =
	"rounded-md bg-muted px-1.5 py-0.5 text-xs text-t3 whitespace-nowrap";
const rowClassName =
	"flex items-center gap-2 rounded-lg border h-12 px-3 min-w-0 cursor-pointer transition-none bg-interactive-secondary hover:bg-interactive-secondary-hover";

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
	onClick,
}: {
	autoTopup: AutoTopup;
	featureNameById: Map<string, string>;
	onClick: () => void;
}) => {
	const purchaseLimit = autoTopup.purchase_limit;

	return (
		<button type="button" className={rowClassName} onClick={onClick}>
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
		</button>
	);
};

const SpendLimitRow = ({
	spendLimit,
	featureNameById,
	onClick,
}: {
	spendLimit: DbSpendLimit;
	featureNameById: Map<string, string>;
	onClick: () => void;
}) => (
	<button type="button" className={rowClassName} onClick={onClick}>
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
	</button>
);

const UsageAlertRow = ({
	usageAlert,
	featureNameById,
	remaining,
	remainingPercentage,
	onClick,
}: {
	usageAlert: DbUsageAlert;
	featureNameById: Map<string, string>;
	remaining: number | null;
	remainingPercentage: number | null;
	onClick: () => void;
}) => {
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
		<button type="button" className={rowClassName} onClick={onClick}>
			<StatusPill enabled={usageAlert.enabled} />
			<span className="truncate text-sm text-t1 font-medium">
				{getFeatureLabel({
					featureId: usageAlert.feature_id,
					featureNameById,
				})}
			</span>
			{usageAlert.name && (
				<span className="truncate text-xs text-t3 font-mono ml-4">
					{usageAlert.name}
				</span>
			)}
			<div className="ml-auto flex items-center gap-1.5 shrink-0">
				{remaining !== null && (
					<Pill>
						Remaining: {remaining.toLocaleString()}
						{remainingPercentage !== null &&
							` (${Math.round(remainingPercentage)}%)`}
					</Pill>
				)}
				<Pill>At: {thresholdLabel}</Pill>
				<Pill className="hidden sm:inline">
					{thresholdTypeLabel[usageAlert.threshold_type]}
				</Pill>
			</div>
		</button>
	);
};

const OverageAllowedRow = ({
	overageAllowed,
	featureNameById,
	onClick,
}: {
	overageAllowed: DbOverageAllowed;
	featureNameById: Map<string, string>;
	onClick: () => void;
}) => (
	<button type="button" className={rowClassName} onClick={onClick}>
		<StatusPill enabled={overageAllowed.enabled} />
		<span className="truncate text-sm text-t1 font-medium">
			{getFeatureLabel({
				featureId: overageAllowed.feature_id,
				featureNameById,
			})}
		</span>
	</button>
);

export function CustomerBillingControlsSection() {
	const { customer, features, isLoading } = useCusQuery();
	const { entityId } = useCustomerContext();
	const setSheet = useSheetStore((s) => s.setSheet);

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
	const overageAllowed = selectedEntity
		? (selectedEntity.overage_allowed ?? [])
		: (fullCustomer?.overage_allowed ?? []);

	const remainingByFeatureId = useMemo(() => {
		if (!fullCustomer)
			return new Map<
				string,
				{ remaining: number; remainingPercentage: number | null }
			>();

		const featureIds = [
			...new Set(
				usageAlerts
					.map((alert) => alert.feature_id)
					.filter((id): id is string => !!id),
			),
		];

		const result = new Map<
			string,
			{ remaining: number; remainingPercentage: number | null }
		>();
		for (const featureId of featureIds) {
			const cusEnts = fullCustomerToCustomerEntitlements({
				fullCustomer,
				featureId,
				entity: selectedEntity ?? undefined,
				inStatuses: ACTIVE_STATUSES,
			});

			const grantedBalance = cusEntsToGrantedBalance({
				cusEnts,
				entityId: entityId ?? undefined,
			});
			const prepaid = cusEntsToPrepaidQuantity({
				cusEnts,
				sumAcrossEntities: nullish(entityId),
			});
			const totalAllowance = grantedBalance + prepaid;

			const balance = cusEntsToBalance({
				cusEnts,
				entityId: entityId ?? undefined,
			});

			result.set(featureId, {
				remaining: balance,
				remainingPercentage:
					totalAllowance > 0 ? (balance / totalAllowance) * 100 : null,
			});
		}
		return result;
	}, [fullCustomer, usageAlerts, selectedEntity, entityId]);

	const hasAnyControls =
		autoTopups.length > 0 ||
		spendLimits.length > 0 ||
		usageAlerts.length > 0 ||
		overageAllowed.length > 0;

	const entitiesWithControlsCount =
		fullCustomer?.entities?.filter(
			(entity: Entity) =>
				(entity.spend_limits?.length ?? 0) > 0 ||
				(entity.usage_alerts?.length ?? 0) > 0 ||
				(entity.overage_allowed?.length ?? 0) > 0,
		).length ?? 0;

	const isEntityView = !!selectedEntity;

	if (!isLoading && !hasAnyControls && !isEntityView) {
		const customerEmptyText =
			entitiesWithControlsCount > 0
				? `No customer-level billing controls — billing controls exist on ${entitiesWithControlsCount} ${entitiesWithControlsCount === 1 ? "entity" : "entities"}`
				: "No billing controls configured";

		return (
			<Table.Container>
				<Table.Toolbar>
					<Table.Heading>
						<GavelIcon size={16} weight="fill" className="text-subtle" />
						Billing controls
					</Table.Heading>
					<Table.Actions>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="secondary"
									size="mini"
									className="gap-2 font-medium"
								>
									<PlusIcon className="size-3.5" />
									Add Control
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									onClick={() => setSheet({ type: "billing-auto-topup-add" })}
								>
									Auto top-up
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => setSheet({ type: "billing-spend-limit-add" })}
								>
									Spend limit
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => setSheet({ type: "billing-usage-alert-add" })}
								>
									Usage alert
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() =>
										setSheet({ type: "billing-overage-allowed-add" })
									}
								>
									Overage allowed
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</Table.Actions>
				</Table.Toolbar>
				<EmptyState text={customerEmptyText} />
			</Table.Container>
		);
	}

	return (
		<Table.Container>
			<Table.Toolbar>
				<Table.Heading>
					<GavelIcon size={16} weight="fill" className="text-subtle" />
					Billing controls
				</Table.Heading>
				<Table.Actions>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="secondary"
								size="mini"
								className="gap-2 font-medium"
							>
								<PlusIcon className="size-3.5" />
								Add Control
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{!selectedEntity && (
								<DropdownMenuItem
									onClick={() => setSheet({ type: "billing-auto-topup-add" })}
								>
									Auto top-up
								</DropdownMenuItem>
							)}
							<DropdownMenuItem
								onClick={() => setSheet({ type: "billing-spend-limit-add" })}
							>
								Spend limit
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setSheet({ type: "billing-usage-alert-add" })}
							>
								Usage alert
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() =>
									setSheet({ type: "billing-overage-allowed-add" })
								}
							>
								Overage allowed
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</Table.Actions>
			</Table.Toolbar>

			{isLoading ? (
				<EmptyState text="Loading billing controls" />
			) : !hasAnyControls ? (
				<EmptyState
					text={
						isEntityView
							? "No billing controls set on this entity"
							: "No billing controls configured"
					}
				/>
			) : (
				<div className="flex flex-col gap-4">
					{autoTopups.length > 0 && (
						<BillingControlsGroup title="Auto top-ups" emptyText="" hasItems>
							<div className="flex flex-col gap-1.5 rounded-lg">
								{autoTopups.map((autoTopup, index) => (
									<AutoTopupRow
										key={`auto-topup-${autoTopup.feature_id}`}
										autoTopup={autoTopup}
										featureNameById={featureNameById}
										onClick={() =>
											setSheet({
												type: "billing-auto-topup-edit",
												data: { index, item: autoTopup },
											})
										}
									/>
								))}
							</div>
						</BillingControlsGroup>
					)}

					{spendLimits.length > 0 && (
						<BillingControlsGroup title="Spend limits" emptyText="" hasItems>
							<div className="flex flex-col gap-1.5 rounded-lg">
								{spendLimits.map((spendLimit, index) => (
									<SpendLimitRow
										key={`spend-limit-${spendLimit.feature_id ?? "global"}-${index}`}
										spendLimit={spendLimit}
										featureNameById={featureNameById}
										onClick={() =>
											setSheet({
												type: "billing-spend-limit-edit",
												data: { index, item: spendLimit },
											})
										}
									/>
								))}
							</div>
						</BillingControlsGroup>
					)}

					{usageAlerts.length > 0 && (
						<BillingControlsGroup title="Usage alerts" emptyText="" hasItems>
							<div className="flex flex-col gap-1.5 rounded-lg">
								{usageAlerts.map((usageAlert, index) => {
									const featureRemaining = usageAlert.feature_id
										? remainingByFeatureId.get(usageAlert.feature_id)
										: null;
									return (
										<UsageAlertRow
											key={`usage-alert-${usageAlert.feature_id ?? "global"}-${usageAlert.name ?? index}`}
											usageAlert={usageAlert}
											featureNameById={featureNameById}
											remaining={featureRemaining?.remaining ?? null}
											remainingPercentage={
												featureRemaining?.remainingPercentage ?? null
											}
											onClick={() =>
												setSheet({
													type: "billing-usage-alert-edit",
													data: { index, item: usageAlert },
												})
											}
										/>
									);
								})}
							</div>
						</BillingControlsGroup>
					)}

					{overageAllowed.length > 0 && (
						<BillingControlsGroup title="Overage allowed" emptyText="" hasItems>
							<div className="flex flex-col gap-1.5 rounded-lg">
								{overageAllowed.map((item, index) => (
									<OverageAllowedRow
										key={`overage-allowed-${item.feature_id}`}
										overageAllowed={item}
										featureNameById={featureNameById}
										onClick={() =>
											setSheet({
												type: "billing-overage-allowed-edit",
												data: { index, item },
											})
										}
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
