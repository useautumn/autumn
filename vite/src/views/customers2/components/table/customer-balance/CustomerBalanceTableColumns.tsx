import type {
	Entity,
	FullCusEntWithOptionalProduct,
	FullCusProduct,
} from "@autumn/shared";
import type { Row } from "@tanstack/react-table";
import { AdminHover } from "@/components/general/AdminHover";
import { cn } from "@/lib/utils";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import { getCusEntHoverTexts } from "@/views/admin/adminUtils";
import { useFeatureUsageBalance } from "@/views/customers2/hooks/useFeatureUsageBalance";
import { CustomerFeatureUsageBar } from "../customer-feature-usage/CustomerFeatureUsageBar";
import { FeatureBalanceDisplay } from "../customer-feature-usage/FeatureBalanceDisplay";

function UsageCell({
	ent,
	filteredCustomerProducts,
	entityId,
}: {
	ent: FullCusEntWithOptionalProduct;
	filteredCustomerProducts: FullCusProduct[];
	entityId: string | null;
}) {
	const hookResult = useFeatureUsageBalance({
		cusProducts: filteredCustomerProducts,
		featureId: ent.entitlement.feature.id,
		entityId,
	});

	// For loose entitlements (no customer_product), use the entitlement data directly
	const isLooseEntitlement = !ent.customer_product;
	const allowance = isLooseEntitlement
		? (ent.entitlement.allowance ?? 0)
		: hookResult.allowance;
	const balance = isLooseEntitlement ? (ent.balance ?? 0) : hookResult.balance;
	const initialAllowance = isLooseEntitlement
		? (ent.entitlement.allowance ?? 0)
		: hookResult.initialAllowance;
	const usageType = isLooseEntitlement
		? ent.entitlement.feature.config?.usage_type
		: hookResult.usageType;
	const shouldShowOutOfBalance = isLooseEntitlement
		? allowance > 0 || balance > 0
		: hookResult.shouldShowOutOfBalance;
	const shouldShowUsed = isLooseEntitlement
		? balance < 0 || (balance === 0 && allowance <= 0)
		: hookResult.shouldShowUsed;

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

function BarCell({
	ent,
	filteredCustomerProducts,
	entityId,
}: {
	ent: FullCusEntWithOptionalProduct;
	filteredCustomerProducts: FullCusProduct[];
	entityId: string | null;
}) {
	const hookResult = useFeatureUsageBalance({
		cusProducts: filteredCustomerProducts,
		featureId: ent.entitlement.feature.id,
		entityId,
	});

	// For loose entitlements (no customer_product), use the entitlement data directly
	const isLooseEntitlement = !ent.customer_product;
	const allowance = isLooseEntitlement
		? (ent.entitlement.allowance ?? 0)
		: hookResult.allowance;
	const balance = isLooseEntitlement ? (ent.balance ?? 0) : hookResult.balance;
	const quantity = isLooseEntitlement ? 1 : hookResult.quantity;

	// Determine whether to show reset or expiry info
	const hasReset = ent.next_reset_at != null;
	const hasExpiry = ent.expires_at != null;

	return (
		<div className="flex gap-3 items-center">
			{hasExpiry ? (
				<span
					className="text-t3 text-tiny flex justify-center !px-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-md min-w-30"
				>
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

export const CustomerBalanceTableColumns = ({
	filteredCustomerProducts,
	entityId,
	aggregatedMap,
	entities = [],
}: {
	filteredCustomerProducts: FullCusProduct[];
	entityId: string | null;
	aggregatedMap: Map<string, FullCusEntWithOptionalProduct[]>;
	entities?: unknown[];
}) => [
	{
		header: "Feature",
		accessorKey: "feature",
		enableResizing: true,
		minSize: 100,
		cell: ({ row }: { row: Row<FullCusEntWithOptionalProduct> }) => {
			const ent = row.original;
			const featureId = ent.entitlement.feature.id;
			const originalEnts = aggregatedMap.get(featureId);
			const isAggregated = originalEnts && originalEnts.length > 1;
			const balanceCount = originalEnts?.length || 1;

			return (
				<div className="flex items-center gap-2">
					<AdminHover
						texts={getCusEntHoverTexts({
							cusEnt: row.original,
							entities: entities as Entity[],
						})}
					>
						<span className="font-medium text-t1 truncate">
							{ent.entitlement.feature.name}
						</span>
					</AdminHover>
					{isAggregated && (
						<div className="text-t3 bg-muted rounded-sm p-1 py-0">
							{balanceCount}
						</div>
					)}
				</div>
			);
		},
	},
	{
		header: "Usage",
		accessorKey: "usage",
		cell: ({ row }: { row: Row<FullCusEntWithOptionalProduct> }) => (
			<UsageCell
				ent={row.original}
				filteredCustomerProducts={filteredCustomerProducts}
				entityId={entityId}
			/>
		),
	},
	{
		header: "Bar",
		size: 220,
		accessorKey: "bar",
		cell: ({ row }: { row: Row<FullCusEntWithOptionalProduct> }) => (
			<BarCell
				ent={row.original}
				filteredCustomerProducts={filteredCustomerProducts}
				entityId={entityId}
			/>
		),
	},
];
