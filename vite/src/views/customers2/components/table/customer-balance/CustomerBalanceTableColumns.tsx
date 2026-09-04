import type {
	Entity,
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import {
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	cusEntsToUnlimitedUsage,
	getRolloverFields,
	isCusEntDisplayExpired,
	nullish,
} from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	ToolbarButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import {
	ArrowsClockwiseIcon,
	BracketsSquareIcon,
	ClockCountdownIcon,
	PulseIcon,
} from "@phosphor-icons/react";
import type { Row } from "@tanstack/react-table";
import { Trash } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { useFeatureUsageBalance } from "@/views/customers2/hooks/useFeatureUsageBalance";
import { CustomerFeatureUsageBar } from "../customer-feature-usage/CustomerFeatureUsageBar";
import { FeatureBalanceDisplay } from "../customer-feature-usage/FeatureBalanceDisplay";
import { AdminSyncAnchorMenuItem } from "./AdminSyncAnchorMenuItem";
import { CustomerBalanceFeatureCell } from "./CustomerBalanceFeatureCell";
import type { CustomerBalanceRowData } from "./CustomerBalanceTable";
import {
	canDeleteCustomerBalance,
	canRecalculateCustomerBalances,
} from "./customerBalanceUtils";

function getActiveRowEntitlements(
	row: Row<CustomerBalanceRowData>,
): FullCusEntWithFullCusProduct[] {
	const ents = row.original.subRows?.length
		? row.original.subRows
		: [row.original];
	return ents.filter((ent) => !isCusEntDisplayExpired({ cusEnt: ent }));
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
		withRollovers: false,
	});

	const grantedBalance = cusEntsToGrantedBalance({
		cusEnts: [ent],
		entityId: entityId ?? undefined,
		withRollovers: false,
	});

	const prepaidAllowance = cusEntsToPrepaidQuantity({
		cusEnts: [ent],
		sumAcrossEntities: nullish(entityId),
	});

	const rolloverBalance =
		getRolloverFields({ cusEnt: ent, entityId: entityId ?? undefined })
			?.balance ?? 0;

	const quantity = ent.customer_product?.quantity || 1;
	// grantedBalance/prepaidAllowance already account for per-entity multiplication
	// at customer level; the manual sum here dropped it, undercounting to one entity.
	const allowance = grantedBalance + prepaidAllowance;
	return { balance, allowance, quantity, rolloverBalance };
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
		rolloverBalance,
		initialAllowance,
		usageType,
		shouldShowOutOfBalance,
		shouldShowUsed,
		unlimitedUsage,
	} = useFeatureUsageBalance({
		fullCustomer,
		featureId: ent.entitlement.feature.id,
		entityId,
		customerEntitlements,
	});

	if (ent.unlimited) {
		return (
			<span className="text-subtle">
				Unlimited
				{unlimitedUsage > 0 &&
					` · ${new Intl.NumberFormat().format(unlimitedUsage)} used`}
			</span>
		);
	}

	return (
		<FeatureBalanceDisplay
			allowance={allowance}
			initialAllowance={initialAllowance}
			balance={balance}
			rolloverBalance={rolloverBalance}
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
		const unlimitedUsage = cusEntsToUnlimitedUsage({
			cusEnts: [ent],
			entityId: entityId ?? undefined,
		});
		return (
			<span className="text-subtle">
				Unlimited
				{unlimitedUsage > 0 &&
					` · ${new Intl.NumberFormat().format(unlimitedUsage)} used`}
			</span>
		);
	}

	const { balance, allowance, rolloverBalance } = getIndividualEntValues({
		ent,
		entityId,
	});
	const shouldShowOutOfBalance = allowance > 0 || balance >= 0;
	const shouldShowUsed = balance < 0;

	return (
		<FeatureBalanceDisplay
			allowance={allowance}
			initialAllowance={allowance}
			balance={balance}
			rolloverBalance={rolloverBalance}
			shouldShowOutOfBalance={shouldShowOutOfBalance}
			shouldShowUsed={shouldShowUsed}
			usageType={ent.entitlement.feature.config?.usage_type}
		/>
	);
}

function ExpiredUsageCell({
	ent,
	entityId,
}: {
	ent: FullCusEntWithFullCusProduct;
	entityId: string | null;
}) {
	if (ent.unlimited) {
		return (
			<span className="text-tertiary-foreground opacity-50">Unlimited</span>
		);
	}
	const { balance, allowance } = getIndividualEntValues({ ent, entityId });
	const format = new Intl.NumberFormat().format;
	return (
		<span className="text-tertiary-foreground opacity-50">
			{format(balance)} / {format(allowance)} left
		</span>
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
	if (isCusEntDisplayExpired({ cusEnt: row.original })) {
		return <ExpiredUsageCell ent={row.original} entityId={entityId} />;
	}
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

const formatChipDate = (timestamp: number | null | undefined) => {
	if (!timestamp) return "";
	const { date, time } = formatUnixToDateTime(timestamp, { withYear: true });
	return `${date} ${time}`;
};

function BalanceExpiryIcon({
	expiresAt,
	forceExpired = false,
}: {
	expiresAt: number | null | undefined;
	/** A churned plan's row is dead even if its own expires_at is in the future. */
	forceExpired?: boolean;
}) {
	const expiredByClock = expiresAt != null && expiresAt <= Date.now();
	const hasExpired = forceExpired || expiredByClock;
	const label = hasExpired ? "Expired" : "Expires";
	const date =
		expiredByClock || !hasExpired ? ` ${formatChipDate(expiresAt)}` : "";

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={cn(
						"shrink-0",
						hasExpired ? "text-tertiary-foreground" : "text-amber-500",
					)}
				>
					<ClockCountdownIcon size={14} weight="duotone" />
				</div>
			</TooltipTrigger>
			<TooltipContent>
				{label}
				{date}
			</TooltipContent>
		</Tooltip>
	);
}

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
	const expiryIcon = hasExpiry ? (
		<BalanceExpiryIcon expiresAt={ent.expires_at} />
	) : null;

	return (
		<div className="flex gap-3 items-center">
			<div className="flex items-center justify-end gap-1.5 shrink-0 min-w-44">
				{hasReset ? (
					<>
						{hasExpiry && (
							<div className="w-3.5 shrink-0 flex justify-center mr-auto">
								{expiryIcon}
							</div>
						)}
						<span className="text-tertiary-foreground text-tiny flex justify-center !px-1 bg-muted rounded-md min-w-36 whitespace-nowrap">
							Resets {formatChipDate(ent.next_reset_at)}
						</span>
					</>
				) : (
					expiryIcon
				)}
			</div>
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

function ExpiredBarCell({ ent }: { ent: FullCusEntWithFullCusProduct }) {
	return (
		<div className="flex gap-3 items-center opacity-50">
			<div className="flex items-center justify-end gap-1.5 shrink-0 min-w-44">
				<BalanceExpiryIcon expiresAt={ent.expires_at} forceExpired />
			</div>
			<div className="w-full max-w-50 min-w-16" />
		</div>
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
	if (isCusEntDisplayExpired({ cusEnt: row.original })) {
		return <ExpiredBarCell ent={row.original} />;
	}
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

function BalanceActionsCell({
	row,
	fullCustomer,
	entityId,
	onDeleteClick,
	onRecordUsageClick,
	onCheckBalanceClick,
	onRecalculateClick,
}: {
	row: Row<CustomerBalanceRowData>;
	fullCustomer: FullCustomer | null | undefined;
	entityId: string | null;
	onDeleteClick?: (balance: FullCusEntWithFullCusProduct) => void;
	onRecordUsageClick?: (balance: FullCusEntWithFullCusProduct) => void;
	onCheckBalanceClick?: (balance: FullCusEntWithFullCusProduct) => void;
	onRecalculateClick?: (balance: FullCusEntWithFullCusProduct) => void;
}) {
	const expired = isCusEntDisplayExpired({ cusEnt: row.original });

	const isParentRow = row.depth === 0;
	const canDelete =
		!row.getCanExpand() &&
		canDeleteCustomerBalance({ balance: row.original }) &&
		(!expired || !row.original.customer_product);
	const canRecordUsage = !expired && isParentRow && !!onRecordUsageClick;
	const canCheckBalance = !expired && isParentRow && !!onCheckBalanceClick;
	const canRecalculate =
		!expired &&
		isParentRow &&
		!!onRecalculateClick &&
		canRecalculateCustomerBalances({
			fullCustomer,
			featureId: row.original.entitlement.feature.id,
			entityId,
		});
	const customerEntitlements = (
		row.subRows.length > 0
			? row.subRows.map((subRow) => subRow.original)
			: [row.original]
	).filter((ent) => !isCusEntDisplayExpired({ cusEnt: ent }));

	// Reserve the slot, or the column edge goes ragged.
	if (!canDelete && !canRecordUsage && !canCheckBalance && !canRecalculate)
		return (
			<div className="flex justify-end" aria-hidden>
				<ToolbarButton className="invisible" tabIndex={-1} />
			</div>
		);

	return (
		<div className="flex justify-end">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<ToolbarButton onClick={(event) => event.stopPropagation()} />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					className="text-muted-foreground"
					align="end"
					onClick={(event) => event.stopPropagation()}
				>
					{canRecordUsage && (
						<DropdownMenuItem
							onClick={(event) => {
								event.stopPropagation();
								onRecordUsageClick(row.original);
							}}
						>
							<div className="flex w-full items-center justify-between gap-2 text-sm">
								Record usage
								<PulseIcon size={12} className="text-tertiary-foreground" />
							</div>
						</DropdownMenuItem>
					)}
					{canCheckBalance && (
						<DropdownMenuItem
							onClick={(event) => {
								event.stopPropagation();
								onCheckBalanceClick(row.original);
							}}
						>
							<div className="flex w-full items-center justify-between gap-2 text-sm">
								Check balance
								<BracketsSquareIcon
									size={12}
									className="text-tertiary-foreground"
								/>
							</div>
						</DropdownMenuItem>
					)}
					{canRecalculate && (
						<DropdownMenuItem
							onClick={(event) => {
								event.stopPropagation();
								onRecalculateClick(row.original);
							}}
						>
							<div className="flex w-full items-center justify-between gap-2 text-sm">
								Recalculate balances
								<ArrowsClockwiseIcon
									size={12}
									className="text-tertiary-foreground"
								/>
							</div>
						</DropdownMenuItem>
					)}
					{isParentRow && (
						<AdminSyncAnchorMenuItem
							customerEntitlements={customerEntitlements}
						/>
					)}
					{canDelete && onDeleteClick && (
						<DropdownMenuItem
							onClick={(event) => {
								event.stopPropagation();
								onDeleteClick(row.original);
							}}
						>
							<div className="flex w-full items-center justify-between gap-2 text-sm">
								Delete
								<Trash size={12} className="text-tertiary-foreground" />
							</div>
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

function MobileBalanceBar({
	ent,
	fullCustomer,
	entityId,
	customerEntitlements,
}: {
	ent: FullCusEntWithFullCusProduct;
	fullCustomer: FullCustomer | null | undefined;
	entityId: string | null;
	customerEntitlements: FullCusEntWithFullCusProduct[];
}) {
	if (isCusEntDisplayExpired({ cusEnt: ent })) return null;
	return (
		<MobileBalanceBarContent
			ent={ent}
			fullCustomer={fullCustomer}
			entityId={entityId}
			customerEntitlements={customerEntitlements}
		/>
	);
}

function MobileBalanceBarContent({
	ent,
	fullCustomer,
	entityId,
	customerEntitlements,
}: {
	ent: FullCusEntWithFullCusProduct;
	fullCustomer: FullCustomer | null | undefined;
	entityId: string | null;
	customerEntitlements: FullCusEntWithFullCusProduct[];
}) {
	const { allowance, balance, quantity } = useFeatureUsageBalance({
		fullCustomer,
		featureId: ent.entitlement.feature.id,
		entityId,
		customerEntitlements,
	});

	if (ent.unlimited || (allowance ?? 0) <= 0) return null;

	return (
		<div className="w-24 shrink-0 flex items-center h-4">
			<CustomerFeatureUsageBar
				allowance={allowance}
				balance={balance}
				quantity={quantity}
				horizontal
			/>
		</div>
	);
}

function MobileUsageWithBar({
	row,
	fullCustomer,
	entityId,
}: {
	row: Row<CustomerBalanceRowData>;
	fullCustomer: FullCustomer | null | undefined;
	entityId: string | null;
}) {
	const customerEntitlements = getActiveRowEntitlements(row);

	return (
		<div className="flex items-center justify-between gap-3">
			<UsageCell
				row={row}
				fullCustomer={fullCustomer}
				entityId={entityId}
				customerEntitlements={customerEntitlements}
			/>
			<MobileBalanceBar
				ent={row.original}
				fullCustomer={fullCustomer}
				entityId={entityId}
				customerEntitlements={customerEntitlements}
			/>
		</div>
	);
}

// --- Column definitions ---

export const CustomerBalanceTableColumns = ({
	fullCustomer,
	entityId,
	entities = [],
	onDeleteClick,
	onRecordUsageClick,
	onCheckBalanceClick,
	onRecalculateClick,
}: {
	fullCustomer: FullCustomer | null | undefined;
	entityId: string | null;
	entities?: Entity[];
	onDeleteClick?: (balance: FullCusEntWithFullCusProduct) => void;
	onRecordUsageClick?: (balance: FullCusEntWithFullCusProduct) => void;
	onCheckBalanceClick?: (balance: FullCusEntWithFullCusProduct) => void;
	onRecalculateClick?: (balance: FullCusEntWithFullCusProduct) => void;
}) => [
	{
		header: "Feature",
		accessorKey: "feature",
		enableResizing: true,
		minSize: 100,
		cell: ({ row }: { row: Row<CustomerBalanceRowData> }) => (
			<CustomerBalanceFeatureCell
				row={row}
				entities={entities}
				fullCustomer={fullCustomer}
			/>
		),
	},
	{
		header: "Usage",
		accessorKey: "usage",
		meta: {
			mobileCard: "full" as const,
			mobileCardCell: (row: Row<CustomerBalanceRowData>) => (
				<MobileUsageWithBar
					row={row}
					fullCustomer={fullCustomer}
					entityId={entityId}
				/>
			),
		},
		cell: ({ row }: { row: Row<CustomerBalanceRowData> }) => (
			<UsageCell
				row={row}
				fullCustomer={fullCustomer}
				entityId={entityId}
				customerEntitlements={getActiveRowEntitlements(row)}
			/>
		),
	},
	{
		header: "Bar",
		size: 220,
		accessorKey: "bar",
		meta: { mobileCard: "hidden" as const },
		cell: ({ row }: { row: Row<CustomerBalanceRowData> }) => (
			<BarCell
				row={row}
				fullCustomer={fullCustomer}
				entityId={entityId}
				customerEntitlements={getActiveRowEntitlements(row)}
			/>
		),
	},
	{
		id: "actions",
		header: "",
		size: 44,
		cell: ({ row }: { row: Row<CustomerBalanceRowData> }) => (
			<BalanceActionsCell
				row={row}
				fullCustomer={fullCustomer}
				entityId={entityId}
				onDeleteClick={onDeleteClick}
				onRecordUsageClick={onRecordUsageClick}
				onCheckBalanceClick={onCheckBalanceClick}
				onRecalculateClick={onRecalculateClick}
			/>
		),
	},
];
