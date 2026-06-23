import type {
	Entity,
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import {
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	getRolloverFields,
	isFreeCustomerEntitlement,
	isPrepaidCustomerEntitlement,
	nullish,
} from "@autumn/shared";
import {
	ArrowsClockwiseIcon,
	BoxArrowDownIcon,
	BracketsSquareIcon,
	CaretRightIcon,
	ClockCountdownIcon,
	MoneyWavyIcon,
	PulseIcon,
	WalletIcon,
} from "@phosphor-icons/react";
import type { Row } from "@tanstack/react-table";
import { Trash } from "lucide-react";
import { AdminHover } from "@/components/general/AdminHover";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { getCusEntHoverTexts } from "@/views/admin/adminUtils";
import { useFeatureUsageBalance } from "@/views/customers2/hooks/useFeatureUsageBalance";
import { CustomerFeatureUsageBar } from "../customer-feature-usage/CustomerFeatureUsageBar";
import { FeatureBalanceDisplay } from "../customer-feature-usage/FeatureBalanceDisplay";
import type { CustomerBalanceRowData } from "./CustomerBalanceTable";
import {
	canDeleteCustomerBalance,
	canRecalculateCustomerBalances,
	getCustomerBalanceSourceParts,
} from "./customerBalanceUtils";

function getBalanceBillingIcon({
	balance,
}: {
	balance: FullCusEntWithFullCusProduct;
}) {
	const size = 14;
	const weight = "duotone" as const;

	if (isFreeCustomerEntitlement(balance))
		return {
			icon: <BoxArrowDownIcon size={size} weight={weight} />,
			color: "text-green-500",
			label: "Included",
		};

	if (isPrepaidCustomerEntitlement(balance))
		return {
			icon: <WalletIcon size={size} weight={weight} />,
			color: "text-orange-500",
			label: "Prepaid price",
		};

	return {
		icon: <MoneyWavyIcon size={size} weight={weight} />,
		color: "text-yellow-500",
		label: "Usage-based price",
	};
}

function BalanceBillingIcon({
	balance,
}: {
	balance: FullCusEntWithFullCusProduct;
}) {
	const { icon, color, label } = getBalanceBillingIcon({ balance });

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className={cn("shrink-0", color)}>{icon}</div>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
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
	} = useFeatureUsageBalance({
		fullCustomer,
		featureId: ent.entitlement.feature.id,
		entityId,
		customerEntitlements,
	});

	if (ent.unlimited) {
		return <span className="text-subtle">Unlimited</span>;
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
		return <span className="text-subtle">Unlimited</span>;
	}

	const { balance, allowance, rolloverBalance } = getIndividualEntValues({
		ent,
		entityId,
	});
	const shouldShowOutOfBalance = allowance > 0 || balance > 0;
	const shouldShowUsed = balance < 0 || (balance === 0 && allowance <= 0);

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

const formatChipDate = (timestamp: number | null | undefined) => {
	if (!timestamp) return "";
	const { date, time } = formatUnixToDateTime(timestamp, { withYear: true });
	return `${date} ${time}`;
};

function BalanceExpiryIcon({
	expiresAt,
}: {
	expiresAt: number | null | undefined;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="shrink-0 text-amber-500">
					<ClockCountdownIcon size={14} weight="duotone" />
				</div>
			</TooltipTrigger>
			<TooltipContent>Expires {formatChipDate(expiresAt)}</TooltipContent>
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
	const isParentRow = row.depth === 0;
	const canDelete =
		!row.getCanExpand() && canDeleteCustomerBalance({ balance: row.original });
	const canRecordUsage = isParentRow && !!onRecordUsageClick;
	const canCheckBalance = isParentRow && !!onCheckBalanceClick;
	const canRecalculate =
		isParentRow &&
		!!onRecalculateClick &&
		canRecalculateCustomerBalances({
			fullCustomer,
			featureId: row.original.entitlement.feature.id,
			entityId,
		});

	if (!canDelete && !canRecordUsage && !canCheckBalance && !canRecalculate)
		return null;

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
	const customerEntitlements = row.original.subRows?.length
		? row.original.subRows
		: [row.original];

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
		cell: ({ row }: { row: Row<CustomerBalanceRowData> }) => {
			const ent = row.original;
			const isSubRow = row.depth > 0;

			if (isSubRow) {
				const { productName, intervalLabel, entityName } =
					getCustomerBalanceSourceParts({ balance: ent, entities });
				const hasPlan = !!ent.customer_product;
				const metaParts = [intervalLabel, entityName]
					.filter(Boolean)
					.join(" · ");

				if (!hasPlan) {
					return (
						<div className="flex items-center gap-2 min-w-0">
							<BalanceBillingIcon balance={ent} />
							<AdminHover
								texts={getCusEntHoverTexts({
									cusEnt: ent,
									entities,
								})}
							>
								<span className="text-tertiary-foreground truncate text-xs">
									{metaParts}
								</span>
							</AdminHover>
						</div>
					);
				}

				return (
					<div className="flex flex-col gap-0.5 min-w-0">
						<div className="flex items-center gap-2">
							<BalanceBillingIcon balance={ent} />
							<AdminHover
								texts={getCusEntHoverTexts({
									cusEnt: ent,
									entities,
								})}
							>
								<span className="text-foreground text-xs font-medium truncate">
									{productName}
								</span>
							</AdminHover>
						</div>
						<span className="text-tertiary-foreground text-xs truncate pl-5.5">
							{metaParts}
						</span>
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
								"inline-flex text-tertiary-foreground transition-transform duration-200",
								isExpanded && "rotate-90",
							)}
						>
							<CaretRightIcon size={14} weight="bold" />
						</span>
					)}
					<AdminHover
						texts={getCusEntHoverTexts({
							cusEnt: ent,
							entities,
						})}
					>
						<span className="font-medium text-foreground truncate">
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
		meta: { mobileCard: "hidden" as const },
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
