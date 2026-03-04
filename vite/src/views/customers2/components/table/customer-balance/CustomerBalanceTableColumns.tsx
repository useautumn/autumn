import type {
	Entity,
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import {
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	cusEntToPrepaidQuantity,
	EntInterval,
	nullish,
} from "@autumn/shared";
import { CaretRightIcon } from "@phosphor-icons/react";
import type { Row } from "@tanstack/react-table";
import { AdminHover } from "@/components/general/AdminHover";
import { cn } from "@/lib/utils";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import { getCusEntHoverTexts } from "@/views/admin/adminUtils";
import { useFeatureUsageBalance } from "@/views/customers2/hooks/useFeatureUsageBalance";
import { CustomerFeatureUsageBar } from "../customer-feature-usage/CustomerFeatureUsageBar";
import { FeatureBalanceDisplay } from "../customer-feature-usage/FeatureBalanceDisplay";
import type { CustomerBalanceRowData } from "./CustomerBalanceTable";

/** Builds a descriptive label for a sub-row (plan + interval + entity) */
function getSubRowLabel({
	ent,
	entities,
}: {
	ent: FullCusEntWithFullCusProduct;
	entities: Entity[];
}) {
	const parts: string[] = [];

	// Plan name
	parts.push(ent.customer_product?.product.name || "No plan");

	// Interval
	const { interval, interval_count } = ent.entitlement;
	if (!interval || interval === EntInterval.Lifetime) {
		parts.push("Lifetime");
	} else {
		const count = interval_count || 1;
		parts.push(count > 1 ? `${count} ${interval}s` : interval);
	}

	// Entity (if scoped)
	const entity = entities.find((e) => {
		if (ent.internal_entity_id) return e.internal_id === ent.internal_entity_id;
		return (
			e.internal_id === ent.customer_product?.internal_entity_id ||
			e.id === ent.customer_product?.entity_id
		);
	});
	if (entity) {
		parts.push(entity.name || entity.id);
	}

	return parts.join(" · ");
}

/** Computes balance values from a single entitlement (for sub-rows) */
function getIndividualEntValues({
	ent,
	entityId,
}: {
	ent: FullCusEntWithFullCusProduct;
	entityId: string | null;
}) {
	const balance = cusEntsToBalance({
		cusEnts: [ent],
		entityId: entityId ?? undefined,
		withRollovers: true,
	});

	const grantedBalance = cusEntsToGrantedBalance({
		cusEnts: [ent],
		entityId: entityId ?? undefined,
		withRollovers: true,
	});

	const prepaidAllowance = cusEntsToPrepaidQuantity({
		cusEnts: [ent],
		sumAcrossEntities: nullish(entityId),
	});
	void grantedBalance;
	void prepaidAllowance;

	const quantity = ent.customer_product?.quantity || 1;
	const allowance =
		(ent.entitlement.allowance ?? 0) * quantity +
		(entityId && ent.entities?.[entityId]
			? (ent.entities[entityId].adjustment ?? ent.adjustment ?? 0)
			: (ent.adjustment ?? 0)) +
		cusEntToPrepaidQuantity({ cusEnt: ent });
	return { balance, allowance, quantity };
}

// --- Usage cells ---

function ParentUsageCell({
	ent,
	fullCustomer,
	entityId,
	customerEntitlements,
}: {
	ent: FullCusEntWithFullCusProduct;
	fullCustomer: FullCustomer | null | undefined;
	entityId: string | null;
	customerEntitlements?: FullCusEntWithFullCusProduct[];
}) {
	const {
		allowance,
		balance,
		initialAllowance,
		usageType,
		shouldShowOutOfBalance,
		shouldShowUsed,
	} = useFeatureUsageBalance({
		fullCustomer,
		featureId: ent.entitlement.feature.id,
		entityId,
		customerEntitlements,
	});

	if (ent.unlimited) {
		return <span className="text-t4">Unlimited</span>;
	}

	return (
		<FeatureBalanceDisplay
			allowance={allowance}
			initialAllowance={initialAllowance}
			balance={balance}
			shouldShowOutOfBalance={shouldShowOutOfBalance}
			shouldShowUsed={shouldShowUsed}
			usageType={usageType}
		/>
	);
}

function SubRowUsageCell({
	ent,
	entityId,
}: {
	ent: FullCusEntWithFullCusProduct;
	entityId: string | null;
}) {
	if (ent.unlimited) {
		return <span className="text-t4">Unlimited</span>;
	}

	const { balance, allowance } = getIndividualEntValues({ ent, entityId });
	const shouldShowOutOfBalance = allowance > 0 || balance > 0;
	const shouldShowUsed = balance < 0 || (balance === 0 && allowance <= 0);

	return (
		<FeatureBalanceDisplay
			allowance={allowance}
			initialAllowance={allowance}
			balance={balance}
			shouldShowOutOfBalance={shouldShowOutOfBalance}
			shouldShowUsed={shouldShowUsed}
			usageType={ent.entitlement.feature.config?.usage_type}
		/>
	);
}

function UsageCell({
	row,
	fullCustomer,
	entityId,
	customerEntitlements,
}: {
	row: Row<CustomerBalanceRowData>;
	fullCustomer: FullCustomer | null | undefined;
	entityId: string | null;
	customerEntitlements?: FullCusEntWithFullCusProduct[];
}) {
	if (row.depth > 0) {
		return <SubRowUsageCell ent={row.original} entityId={entityId} />;
	}
	return (
		<ParentUsageCell
			customerEntitlements={customerEntitlements}
			ent={row.original}
			fullCustomer={fullCustomer}
			entityId={entityId}
		/>
	);
}

// --- Bar cells ---

function BarCellContent({
	ent,
	allowance,
	balance,
	quantity,
}: {
	ent: FullCusEntWithFullCusProduct;
	allowance: number;
	balance: number;
	quantity: number;
}) {
	const hasReset = ent.next_reset_at != null;
	const hasExpiry = ent.expires_at != null;

	return (
		<div className="flex gap-3 items-center">
			{hasExpiry ? (
				<span className="text-t3 text-tiny flex justify-center !px-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-md min-w-30">
					Expires {formatUnixToDateTimeString(ent.expires_at)}
				</span>
			) : (
				<span
					className={cn(
						"text-t3 text-tiny flex justify-center !px-1 bg-muted rounded-md min-w-30",
						hasReset ? "opacity-100" : "opacity-0",
					)}
				>
					Resets {formatUnixToDateTimeString(ent.next_reset_at)}
				</span>
			)}
			<div
				className={cn(
					"w-full max-w-50 flex justify-center pr-2 h-full items-center min-w-16",
					(allowance ?? 0) > 0 ? "opacity-100" : "opacity-0",
				)}
			>
				<CustomerFeatureUsageBar
					allowance={allowance}
					balance={balance}
					quantity={quantity}
					horizontal={true}
				/>
			</div>
		</div>
	);
}

function ParentBarCell({
	ent,
	fullCustomer,
	entityId,
	customerEntitlements,
}: {
	ent: FullCusEntWithFullCusProduct;
	fullCustomer: FullCustomer | null | undefined;
	entityId: string | null;
	customerEntitlements?: FullCusEntWithFullCusProduct[];
}) {
	const { allowance, balance, quantity } = useFeatureUsageBalance({
		fullCustomer,
		featureId: ent.entitlement.feature.id,
		entityId,
		customerEntitlements,
	});

	return (
		<BarCellContent
			ent={ent}
			allowance={allowance}
			balance={balance}
			quantity={quantity}
		/>
	);
}

function SubRowBarCell({
	ent,
	entityId,
}: {
	ent: FullCusEntWithFullCusProduct;
	entityId: string | null;
}) {
	const { allowance, balance, quantity } = getIndividualEntValues({
		ent,
		entityId,
	});

	return (
		<BarCellContent
			ent={ent}
			allowance={allowance}
			balance={balance}
			quantity={quantity}
		/>
	);
}

function BarCell({
	row,
	fullCustomer,
	entityId,
	customerEntitlements,
}: {
	row: Row<CustomerBalanceRowData>;
	fullCustomer: FullCustomer | null | undefined;
	entityId: string | null;
	customerEntitlements?: FullCusEntWithFullCusProduct[];
}) {
	if (row.depth > 0) {
		return <SubRowBarCell ent={row.original} entityId={entityId} />;
	}
	return (
		<ParentBarCell
			customerEntitlements={customerEntitlements}
			ent={row.original}
			fullCustomer={fullCustomer}
			entityId={entityId}
		/>
	);
}

// --- Column definitions ---

export const CustomerBalanceTableColumns = ({
	fullCustomer,
	entityId,
	entities = [],
}: {
	fullCustomer: FullCustomer | null | undefined;
	entityId: string | null;
	entities?: unknown[];
}) => [
	{
		header: "Feature",
		accessorKey: "feature",
		enableResizing: true,
		minSize: 100,
		cell: ({ row }: { row: Row<CustomerBalanceRowData> }) => {
			const ent = row.original;
			const isSubRow = row.depth > 0;

			if (isSubRow) {
				return (
					<div className="flex items-center gap-2 pl-5.5">
						<AdminHover
							texts={getCusEntHoverTexts({
								cusEnt: ent,
								entities: entities as Entity[],
							})}
						>
							<span className="text-t2 truncate">
								{getSubRowLabel({ ent, entities: entities as Entity[] })}
							</span>
						</AdminHover>
					</div>
				);
			}

			const canExpand = row.getCanExpand();
			const isExpanded = row.getIsExpanded();

			return (
				<div className="flex items-center gap-2">
					{canExpand && (
						<span
							className={cn(
								"inline-flex text-t3 transition-transform duration-200",
								isExpanded && "rotate-90",
							)}
						>
							<CaretRightIcon size={14} weight="bold" />
						</span>
					)}
					<AdminHover
						texts={getCusEntHoverTexts({
							cusEnt: ent,
							entities: entities as Entity[],
						})}
					>
						<span className="font-medium text-t1 truncate">
							{ent.entitlement.feature.name}
						</span>
					</AdminHover>
				</div>
			);
		},
	},
	{
		header: "Usage",
		accessorKey: "usage",
		cell: ({ row }: { row: Row<CustomerBalanceRowData> }) => (
			<UsageCell
				row={row}
				fullCustomer={fullCustomer}
				entityId={entityId}
				customerEntitlements={
					row.original.subRows?.length ? row.original.subRows : [row.original]
				}
			/>
		),
	},
	{
		header: "Bar",
		size: 220,
		accessorKey: "bar",
		cell: ({ row }: { row: Row<CustomerBalanceRowData> }) => (
			<BarCell
				row={row}
				fullCustomer={fullCustomer}
				entityId={entityId}
				customerEntitlements={
					row.original.subRows?.length ? row.original.subRows : [row.original]
				}
			/>
		),
	},
];
