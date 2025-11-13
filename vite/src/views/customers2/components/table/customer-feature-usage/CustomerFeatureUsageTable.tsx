import {
	FeatureType,
	FeatureUsageType,
	type FullCustomerEntitlement,
} from "@autumn/shared";
import { PuzzlePiece } from "@phosphor-icons/react";
import { type ExpandedState, getExpandedRowModel } from "@tanstack/react-table";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { cn } from "@/lib/utils";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import UpdateCusEntitlement from "@/views/customers/customer/entitlements/UpdateCusEntitlement";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { ShowExpiredActionButton } from "../customer-products/ShowExpiredActionButton";
import { CustomerFeatureUsageBar } from "./CustomerFeatureUsageBar";
import { CustomerFeatureUsageColumns } from "./CustomerFeatureUsageColumns";
import { filterCustomerFeatureUsage } from "./customerFeatureUsageTableFilters";
import type { CustomerFeatureUsageRowData } from "./customerFeatureUsageTypes";
import {
	createFeaturesMap,
	deduplicateEntitlements,
	filterBooleanEntitlements,
	flattenCustomerEntitlements,
	processNonBooleanEntitlements,
} from "./customerFeatureUsageUtils";

export function CustomerFeatureUsageTable() {
	const { customer, features, isLoading } = useCusQuery();

	const [showExpired, setShowExpired] = useQueryState(
		"customerFeatureUsageShowExpired",
		parseAsBoolean.withDefault(false),
	);

	const [expanded, setExpanded] = useState<ExpandedState>({});

	const [selectedCusEntitlement, setSelectedCusEntitlement] =
		useState<FullCustomerEntitlement | null>(null);

	const cusEnts = useMemo(
		() =>
			flattenCustomerEntitlements({
				customerProducts: customer?.customer_products ?? [],
			}),
		[customer],
	);

	const featuresMap = useMemo(
		() => createFeaturesMap({ features: features ?? [] }),
		[features],
	);

	const filteredCusEnts = useMemo(
		() =>
			filterCustomerFeatureUsage({
				entitlements: cusEnts,
				showExpired: showExpired ?? true,
			}),
		[cusEnts, showExpired],
	);

	const deduplicatedCusEnts = useMemo(
		() => deduplicateEntitlements({ entitlements: filteredCusEnts }),
		[filteredCusEnts],
	);

	const nonBooleanEnts = useMemo(
		() =>
			processNonBooleanEntitlements({
				entitlements: deduplicatedCusEnts,
				cusEnts,
				featuresMap,
			}).sort((a, b) => {
				const aAllowance = a.entitlement.allowance ?? 0;
				const bAllowance = b.entitlement.allowance ?? 0;
				const aHasAllowance = aAllowance > 0;
				const bHasAllowance = bAllowance > 0;

				// Items with allowance > 0 come first
				if (aHasAllowance && !bHasAllowance) return -1;
				if (!aHasAllowance && bHasAllowance) return 1;
				return 0;
			}),
		[cusEnts, deduplicatedCusEnts, featuresMap],
	);

	// console.log("nonBooleanEnts", nonBooleanEnts);

	const booleanEnts = useMemo(
		() => filterBooleanEntitlements({ entitlements: deduplicatedCusEnts }),
		[deduplicatedCusEnts],
	);

	const enableSorting = false;
	const table = useCustomerTable<CustomerFeatureUsageRowData>({
		data: nonBooleanEnts,
		columns: CustomerFeatureUsageColumns,
		options: {
			getExpandedRowModel: getExpandedRowModel(),
			getSubRows: (row) => ("subRows" in row ? row.subRows : undefined),
			getRowCanExpand: (row) =>
				"entitlement" in row.original &&
				row.original.entitlement?.feature?.type === FeatureType.CreditSystem,
			state: {
				expanded,
			},
			onExpandedChange: setExpanded,
		},
	});

	console.log("table", table);

	const booleanTable = useCustomerTable<CustomerFeatureUsageRowData>({
		data: booleanEnts,
		columns: CustomerFeatureUsageColumns,
	});

	const shouldShowOutOfBalance = (ent: FullCustomerEntitlement) =>
		(ent.entitlement.allowance ?? 0) > 0 || (ent.balance ?? 0) > 0;

	const shouldShowUsed = (ent: FullCustomerEntitlement) =>
		(ent.balance ?? 0) < 0 ||
		((ent.balance ?? 0) === 0 && (ent.entitlement.allowance ?? 0) <= 0);

	return (
		<>
			<UpdateCusEntitlement
				selectedCusEntitlement={selectedCusEntitlement}
				setSelectedCusEntitlement={setSelectedCusEntitlement}
			/>
			<Table.Provider
				config={{
					table,
					numberOfColumns: CustomerFeatureUsageColumns.length,
					enableSorting,
					isLoading,
					onRowClick: (row) => {
						if ("isSubRow" in row && row.isSubRow) {
							// Handle subrow case - maybe extract parent entitlement?
							return;
						}
						setSelectedCusEntitlement(row as FullCustomerEntitlement);
						// console.log(row);
					},
				}}
			>
				<Table.Container>
					<Table.Toolbar>
						<Table.Heading>
							<PuzzlePiece size={16} weight="fill" className="text-t5" />
							Balances
						</Table.Heading>
						<Table.Actions>
							<ShowExpiredActionButton
								showExpired={showExpired}
								setShowExpired={setShowExpired}
							/>
						</Table.Actions>
					</Table.Toolbar>
					<div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-2">
						{/* <div className="flex flex-col divide-y bg-white border border-border-table rounded-2xl shadow-sm overflow-hidden"> */}
						{nonBooleanEnts.map((ent) => (
							<div
								key={ent.entitlement.feature.id}
								className="flex flex-col items-start gap-2 pt-3 min-w-60 text-t2 text-sm hover:bg-stone-100 whitespace-nowrap bg-white border border-border-table rounded-xl shadow-sm overflow-hidden"
								onClick={() => {
									setSelectedCusEntitlement(ent);
								}}
							>
								<div className="flex justify-between w-full items-center h-4 px-4">
									<span className="font-semibold">
										{ent.entitlement.feature.name}
									</span>
									{/* <CustomerFeatureConfiguration
										feature={ent.entitlement.feature}
									/> */}
									{ent.next_reset_at ? (
										<span className="text-t3 text-tiny text-start ">
											Resets&nbsp;
											{ent.next_reset_at
												? formatUnixToDateTimeString(ent.next_reset_at)
												: "-"}
										</span>
									) : (
										<span className="text-t3 text-tiny text-start ">
											No Reset
										</span>
									)}
								</div>
								<div className="flex justify-between w-full items-end px-4">
									<div className="flex items-center gap-4 w-full">
										{ent.unlimited ? (
											<span className="text-t4">Unlimited</span>
										) : (
											<div className="flex gap-1">
												{shouldShowOutOfBalance(ent) && (
													<div className="flex gap-1">
														<span className="">
															{ent.balance && ent.balance < 0
																? 0
																: new Intl.NumberFormat().format(
																		ent.balance ?? 0,
																	)}
														</span>{" "}
														<p className="text-t4 flex items-end text-tiny">
															{(ent.entitlement?.allowance ?? 0) > 0 && (
																<span>
																	/&nbsp;
																	{new Intl.NumberFormat().format(
																		ent.entitlement.allowance ?? 0,
																	)}
																</span>
															)}{" "}
															&nbsp;
															<span className="text-t4 text-tiny"></span>
														</p>
													</div>
												)}
												{shouldShowUsed(ent) && (
													<p className="">
														{shouldShowOutOfBalance(ent) &&
															shouldShowUsed(ent) &&
															"+"}
														{new Intl.NumberFormat().format(
															ent.balance && ent.balance < 0
																? ent.balance * -1
																: 0,
														)}{" "}
														<span className="text-t4 text-tiny">
															{ent.entitlement.feature.config?.usage_type ===
															FeatureUsageType.Continuous
																? "in use"
																: "used"}
														</span>
													</p>
												)}
											</div>
										)}
									</div>
								</div>
								<div
									className={cn(
										"w-full",
										(ent.entitlement.allowance ?? 0) > 0
											? "opacity-100"
											: "opacity-0",
									)}
								>
									<CustomerFeatureUsageBar
										allowance={ent.entitlement.allowance ?? 0}
										balance={ent.balance ?? 0}
										quantity={ent.customer_product.quantity ?? 1}
										horizontal={true}
									/>
								</div>
							</div>
						))}
					</div>
					{/* <Table.Content>
						<Table.Header />
						<Table.Body />
					</Table.Content> */}
				</Table.Container>
			</Table.Provider>
			{booleanEnts.length > 0 && (
				<Table.Provider
					config={{
						table: booleanTable,
						numberOfColumns: CustomerFeatureUsageColumns.length,
						enableSorting,
						isLoading,
					}}
				>
					<Table.Container className="!pt-0">
						<Table.Content>
							<Table.Header className="!h-0 opacity-0 pointer-events-none overflow-hidden border-none [&_tr]:h-0 [&_tr]:border-none [&_th]:h-0 [&_th]:p-0 [&_th]:leading-[0] [&_th]:border-none" />
							<Table.Body />
						</Table.Content>
					</Table.Container>
				</Table.Provider>
			)}
		</>
	);
}
