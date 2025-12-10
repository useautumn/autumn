import {
	cusEntToBalance,
	cusEntToIncludedUsage,
	cusProductsToCusEnts,
	FeatureUsageType,
	type FullCusProduct,
	notNullish,
	sumValues,
} from "@autumn/shared";
import { cn } from "@/lib/utils";
import { CustomerFeatureUsageBar } from "../customer-feature-usage/CustomerFeatureUsageBar";

interface FeatureUsageCellProps {
	customerProducts: FullCusProduct[] | undefined;
	featureId: string;
	isLoading?: boolean;
}

/**
 * Displays feature usage balance and bar stacked vertically for use in the customer list table
 */
export function FeatureUsageCell({
	customerProducts,
	featureId,
	isLoading = false,
}: FeatureUsageCellProps) {
	if (isLoading) {
		return (
			<div className="flex flex-col gap-1 w-full min-w-20">
				<div className="h-4 w-12 bg-muted animate-pulse rounded" />
				<div className="h-1 w-full bg-muted animate-pulse rounded-full" />
			</div>
		);
	}

	if (!customerProducts || customerProducts.length === 0) {
		return <span className="text-t3 text-xs">—</span>;
	}

	const cusEnts = cusProductsToCusEnts({
		cusProducts: customerProducts,
		featureId,
	});

	if (cusEnts.length === 0) {
		return <span className="text-t3 text-xs">—</span>;
	}

	const allowance = sumValues(
		cusEnts.map((cusEnt) =>
			cusEntToIncludedUsage({
				cusEnt,
				entityId: undefined,
			}),
		),
	);

	const balance = sumValues(
		cusEnts
			.map((cusEnt) =>
				cusEntToBalance({
					cusEnt,
					entityId: undefined,
					withRollovers: true,
				}),
			)
			.filter(notNullish),
	);

	const firstEnt = cusEnts[0];
	const isUnlimited = cusEnts.some((e) => e.unlimited);
	const usageType = firstEnt?.entitlement?.feature?.config?.usage_type;
	const quantity = cusEnts.reduce(
		(sum, e) => sum + (e.customer_product.quantity ?? 1),
		0,
	);

	const shouldShowOutOfBalance = allowance > 0 || (balance ?? 0) > 0;
	const shouldShowUsed =
		balance < 0 || ((balance ?? 0) === 0 && (allowance ?? 0) <= 0);

	if (isUnlimited) {
		return <span className="text-t3 text-xs">Unlimited</span>;
	}

	return (
		<div className="flex flex-col gap-1 w-full min-w-20">
			<div className="flex items-center text-xs">
				{shouldShowOutOfBalance && (
					<div className="flex gap-0.5 items-baseline">
						<span className="text-t1">
							{balance < 0 ? 0 : new Intl.NumberFormat().format(balance ?? 0)}
						</span>
						{allowance > 0 && (
							<span className="text-t4">
								/{new Intl.NumberFormat().format(allowance)}
							</span>
						)}
					</div>
				)}
				{shouldShowUsed && (
					<span className="text-t2">
						{shouldShowOutOfBalance && shouldShowUsed && " +"}
						{new Intl.NumberFormat().format(balance < 0 ? balance * -1 : 0)}{" "}
						<span className="text-t4">
							{allowance > 0
								? "overage"
								: usageType === FeatureUsageType.Continuous
									? "in use"
									: "used"}
						</span>
					</span>
				)}
			</div>
			<div
				className={cn("w-full", allowance > 0 ? "opacity-100" : "opacity-0")}
			>
				<CustomerFeatureUsageBar
					allowance={allowance ?? 0}
					balance={balance ?? 0}
					quantity={quantity}
					horizontal={true}
				/>
			</div>
		</div>
	);
}
