import {
	cusEntToBalance,
	cusEntToIncludedUsage,
	cusProductsToCusEnts,
	FeatureUsageType,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	notNullish,
	sumValues,
} from "@autumn/shared";
import type { Row } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import { CustomerFeatureUsageBar } from "../customer-feature-usage/CustomerFeatureUsageBar";

export const CustomerBalanceTableColumns = ({
	filteredCustomerProducts,
	entityId,
	aggregatedMap,
}: {
	filteredCustomerProducts: FullCusProduct[];
	entityId: string | null;
	aggregatedMap: Map<string, FullCusEntWithFullCusProduct[]>;
}) => [
	{
		header: "Feature",
		size: 160,
		accessorKey: "feature",
		cell: ({ row }: { row: Row<FullCusEntWithFullCusProduct> }) => {
			const ent = row.original;
			const featureId = ent.entitlement.feature.id;
			const originalEnts = aggregatedMap.get(featureId);
			const isAggregated = originalEnts && originalEnts.length > 1;
			const balanceCount = originalEnts?.length || 1;

			return (
				<div className="flex items-center gap-2">
					<span className="font-medium text-t1 truncate">
						{ent.entitlement.feature.name}
					</span>
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
		size: 200,
		accessorKey: "usage",
		cell: ({ row }: { row: Row<FullCusEntWithFullCusProduct> }) => {
			const ent = row.original;
			const featureId = ent.entitlement.feature.id;

			const cusEnts = cusProductsToCusEnts({
				cusProducts: filteredCustomerProducts,
				featureId,
			});

			const allowance = sumValues(
				cusEnts.map((cusEnt) => {
					const includedUsage = cusEntToIncludedUsage({
						cusEnt,
						entityId: entityId ?? undefined,
					});
					return includedUsage;
				}),
			);

			const balance = sumValues(
				cusEnts
					.map((cusEnt) =>
						cusEntToBalance({
							cusEnt,
							entityId: entityId ?? undefined,
							withRollovers: true,
						}),
					)
					.filter(notNullish),
			);

			const shouldShowOutOfBalance = () => {
				return allowance > 0 || (balance ?? 0) > 0;
			};

			const shouldShowUsed = () => {
				return balance < 0 || ((balance ?? 0) === 0 && (allowance ?? 0) <= 0);
			};

			if (ent.unlimited) {
				return <span className="text-t4">Unlimited</span>;
			}

			return (
				<div className="flex gap-1">
					{shouldShowOutOfBalance() && (
						<div className="flex gap-0.5">
							<span className="">
								{balance && balance < 0
									? 0
									: new Intl.NumberFormat().format(balance ?? 0)}
							</span>
							<p className="text-t4 flex items-end text-tiny gap-0.5">
								{(allowance ?? 0) > 0 && (
									<>
										<span>/</span>
										<span>
											{new Intl.NumberFormat().format(allowance ?? 0)} left
										</span>
									</>
								)}{" "}
								<span className="text-t4 text-tiny"></span>
							</p>
						</div>
					)}
					{shouldShowUsed() && (
						<p className="">
							{shouldShowOutOfBalance() && shouldShowUsed() && "+"}
							{new Intl.NumberFormat().format(
								balance && balance < 0 ? balance * -1 : 0,
							)}{" "}
							<span className="text-t4 text-tiny">
								{allowance > 0
									? "overage"
									: ent.entitlement.feature.config?.usage_type ===
											FeatureUsageType.Continuous
										? "in use"
										: "used"}
							</span>
						</p>
					)}
				</div>
			);
		},
	},
	{
		header: "Reset Date",
		size: 120,
		accessorKey: "reset_date",
		cell: ({ row }: { row: Row<FullCusEntWithFullCusProduct> }) => {
			const ent = row.original;

			if (!ent.next_reset_at) {
				return <span className="text-t3"></span>;
			}

			return (
				<div className="flex justify-end w-full">
					<span className="text-t3 text-tiny flex justify-center !px-1 bg-muted w-fit rounded-md">
						Resets {formatUnixToDateTimeString(ent.next_reset_at)}
					</span>
				</div>
			);
		},
	},
	{
		header: "Bar",
		size: 220,
		accessorKey: "bar",
		cell: ({ row }: { row: Row<FullCusEntWithFullCusProduct> }) => {
			const ent = row.original;
			const featureId = ent.entitlement.feature.id;

			const cusEnts = cusProductsToCusEnts({
				cusProducts: filteredCustomerProducts,
				featureId,
			});

			const allowance = sumValues(
				cusEnts.map((cusEnt) => {
					const includedUsage = cusEntToIncludedUsage({
						cusEnt,
						entityId: entityId ?? undefined,
					});
					return includedUsage;
				}),
			);

			const balance = sumValues(
				cusEnts
					.map((cusEnt) =>
						cusEntToBalance({
							cusEnt,
							entityId: entityId ?? undefined,
							withRollovers: true,
						}),
					)
					.filter(notNullish),
			);

			return (
				<div className="flex gap-3 items-center">
					{/* <span className="text-t3 text-tiny flex justify-center !px-1 bg-muted w-fit rounded-md">
						Resets {formatUnixToDateTimeString(ent.next_reset_at)}
					</span> */}
					<div
						className={cn(
							"w-full max-w-50 flex justify-center pr-2 h-full items-center",
							(allowance ?? 0) > 0 ? "opacity-100" : "opacity-0",
						)}
					>
						<CustomerFeatureUsageBar
							allowance={allowance ?? 0}
							balance={balance ?? 0}
							quantity={ent.customer_product.quantity ?? 1}
							horizontal={true}
						/>
					</div>
				</div>
			);
		},
	},
];
