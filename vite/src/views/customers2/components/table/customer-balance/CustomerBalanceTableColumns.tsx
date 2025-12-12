import type {
	Entity,
	FullCusEntWithFullCusProduct,
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
	ent: FullCusEntWithFullCusProduct;
	filteredCustomerProducts: FullCusProduct[];
	entityId: string | null;
}) {
	const {
		allowance,
		balance,
		shouldShowOutOfBalance,
		shouldShowUsed,
		usageType,
	} = useFeatureUsageBalance({
		cusProducts: filteredCustomerProducts,
		featureId: ent.entitlement.feature.id,
		entityId,
	});

	if (ent.unlimited) {
		return <span className="text-t4">Unlimited</span>;
	}

	return (
		<FeatureBalanceDisplay
			allowance={allowance}
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
	ent: FullCusEntWithFullCusProduct;
	filteredCustomerProducts: FullCusProduct[];
	entityId: string | null;
}) {
	const { allowance, balance, quantity } = useFeatureUsageBalance({
		cusProducts: filteredCustomerProducts,
		featureId: ent.entitlement.feature.id,
		entityId,
	});

	return (
		<div className="flex gap-3 items-center">
			<span
				className={cn(
					"text-t3 text-tiny flex justify-center !px-1 bg-muted rounded-md min-w-30",
					ent.next_reset_at ? "opacity-100" : "opacity-0",
				)}
			>
				Resets {formatUnixToDateTimeString(ent.next_reset_at)}
			</span>
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
	aggregatedMap: Map<string, FullCusEntWithFullCusProduct[]>;
	entities?: unknown[];
}) => [
	{
		header: "Feature",
		accessorKey: "feature",
		enableResizing: true,
		minSize: 100,
		cell: ({ row }: { row: Row<FullCusEntWithFullCusProduct> }) => {
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
		cell: ({ row }: { row: Row<FullCusEntWithFullCusProduct> }) => (
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
		cell: ({ row }: { row: Row<FullCusEntWithFullCusProduct> }) => (
			<BarCell
				ent={row.original}
				filteredCustomerProducts={filteredCustomerProducts}
				entityId={entityId}
			/>
		),
	},
];
