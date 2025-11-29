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
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import { CustomerFeatureUsageBar } from "../table/customer-feature-usage/CustomerFeatureUsageBar";

export const MeteredFeatureBalanceCard = ({
	ent,
	filteredCustomerProducts,
	featureId,
	entityId,
	aggregatedMap,
	allEnts,
}: {
	ent: FullCusEntWithFullCusProduct;
	filteredCustomerProducts: FullCusProduct[];
	featureId: string;
	entityId: string | null;
	aggregatedMap: Map<string, FullCusEntWithFullCusProduct[]>;
	allEnts: FullCusEntWithFullCusProduct[];
}) => {
	const setBalanceSheet = useCustomerBalanceSheetStore((s) => s.setSheet);
	const setSheet = useSheetStore((s) => s.setSheet);
	const originalEnts = aggregatedMap.get(featureId);
	const isAggregated = originalEnts && originalEnts.length > 1;
	const balanceCount = originalEnts?.length || 1;

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

	return (
		<div
			key={ent.entitlement.feature.id}
			className={cn(
				"flex flex-col items-center justify-center gap-2 px-4 min-w-60 text-t2 text-sm hover:bg-interactive-secondary-hover whitespace-nowrap bg-interactive-secondary border rounded-lg shadow-sm overflow-hidden relative h-16",
				allEnts.length === 1 && "max-w-[50%]",
			)}
			onClick={(e) => {
				e.stopPropagation();
				const ents = aggregatedMap.get(featureId) || [ent];
				const hasMultipleBalances = ents.length > 1;

				// Set balance data in balance store
				setBalanceSheet({
					type: "edit-balance",
					featureId,
					originalEntitlements: ents,
					selectedCusEntId: hasMultipleBalances ? null : ents[0].id,
				});

				// Open the appropriate inline sheet
				if (hasMultipleBalances) {
					setSheet({ type: "balance-selection" });
				} else {
					setSheet({ type: "balance-edit" });
				}
			}}
		>
			<div className="flex justify-between w-full items-center h-4">
				<div className="flex items-center gap-2">
					<span className="font-medium text-t1">
						{ent.entitlement.feature.name}
					</span>
					{isAggregated && (
						<div className="text-t3 bg-muted rounded-sm p-1 py-0">
							{balanceCount}
						</div>
					)}
				</div>
				{ent.next_reset_at ? (
					<span className="text-t3 text-tiny bg-muted rounded-md p-1.5 py-0">
						Resets&nbsp;
						{ent.next_reset_at
							? formatUnixToDateTimeString(ent.next_reset_at)
							: "-"}
					</span>
				) : (
					<span className="text-t3 text-tiny text-start "></span>
				)}
			</div>
			<div className="flex justify-between w-full items-center ">
				<div className="flex items-center gap-4 w-full">
					{ent.unlimited ? (
						<span className="text-t4">Unlimited</span>
					) : (
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
													{new Intl.NumberFormat().format(allowance ?? 0)}
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
					)}
				</div>
				<div
					className={cn(
						"flex justify-end pt-2 w-36",
						(ent.entitlement.allowance ?? 0) > 0 ? "opacity-100" : "opacity-0",
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
		</div>
	);
};
