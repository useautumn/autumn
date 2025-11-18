import type { Entity } from "@autumn/shared";
import { FeatureType, type FullCusProduct } from "@autumn/shared";
import { PuzzlePiece } from "@phosphor-icons/react";
import { type ExpandedState, getExpandedRowModel } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { CustomerBalanceTable } from "../customer-balance/CustomerBalanceTable";
import { CustomerBooleanBalanceTable } from "../customer-boolean-balance/CustomerBooleanBalanceTable";
import { CustomerFeatureUsageColumns } from "./CustomerFeatureUsageColumns";
import { filterCustomerFeatureUsage } from "./customerFeatureUsageTableFilters";
import type { CustomerFeatureUsageRowData } from "./customerFeatureUsageTypes";
import {
	createFeaturesMap,
	deduplicateEntitlements,
	flattenCustomerEntitlements,
	processNonBooleanEntitlements,
} from "./customerFeatureUsageUtils";
import { EmptyState } from "../EmptyState";

export function CustomerFeatureUsageTable() {
	const { customer, features, isLoading } = useCusQuery();
	const { entityId } = useCustomerContext();

	const [expanded, setExpanded] = useState<ExpandedState>({});

	const filteredCustomerProducts = useMemo(() => {
		if (!entityId) {
			return customer?.customer_products ?? [];
		}

		const selectedEntity = customer?.entities.find(
			(e: Entity) => e.id === entityId || e.internal_id === entityId,
		);

		if (!selectedEntity) {
			return customer?.customer_products ?? [];
		}

		return (customer?.customer_products ?? []).filter(
			(cp: FullCusProduct) =>
				(!cp.internal_entity_id && !cp.entity_id) ||
				cp.internal_entity_id === selectedEntity.internal_id ||
				cp.entity_id === selectedEntity.id,
		);
	}, [customer?.customer_products, customer?.entities, entityId]);

	const cusEnts = useMemo(
		() =>
			flattenCustomerEntitlements({
				customerProducts: filteredCustomerProducts,
			}),
		[filteredCustomerProducts],
	);

	const featuresMap = useMemo(
		() => createFeaturesMap({ features: features ?? [] }),
		[features],
	);

	const filteredCusEnts = useMemo(
		() =>
			filterCustomerFeatureUsage({
				entitlements: cusEnts,
				showExpired: false,
			}),
		[cusEnts],
	);

	const { entitlements: deduplicatedCusEnts, aggregatedMap } = useMemo(
		() => deduplicateEntitlements({ entitlements: filteredCusEnts, entityId }),
		[filteredCusEnts, entityId],
	);

	const allEnts = useMemo(
		() =>
			processNonBooleanEntitlements({
				entitlements: deduplicatedCusEnts,
				cusEnts: deduplicatedCusEnts,
				featuresMap,
			})
				.concat(
					deduplicatedCusEnts.filter(
						(ent) => ent.entitlement.feature.type === FeatureType.Boolean,
					),
				)
				.sort((a, b) => {
					const aIsBoolean = a.entitlement.feature.type === FeatureType.Boolean;
					const bIsBoolean = b.entitlement.feature.type === FeatureType.Boolean;
					const aAllowance = a.entitlement.allowance ?? 0;
					const bAllowance = b.entitlement.allowance ?? 0;
					const aHasAllowance = aAllowance > 0;
					const bHasAllowance = bAllowance > 0;

					// Non-boolean items with allowance > 0 come first
					if (!aIsBoolean && aHasAllowance && (bIsBoolean || !bHasAllowance))
						return -1;
					if (!bIsBoolean && bHasAllowance && (aIsBoolean || !aHasAllowance))
						return 1;
					// Then non-boolean items without allowance
					if (!aIsBoolean && !bIsBoolean) return 0;
					// Boolean items come last
					if (aIsBoolean && !bIsBoolean) return 1;
					if (!aIsBoolean && bIsBoolean) return -1;
					return 0;
				}),
		[deduplicatedCusEnts, featuresMap],
	);

	const enableSorting = false;
	const table = useCustomerTable<CustomerFeatureUsageRowData>({
		data: allEnts,
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

	const hasBalances = allEnts.length > 0;

	return (
		<div className="flex flex-col gap-8">
			<Table.Provider
				config={{
					table,
					numberOfColumns: CustomerFeatureUsageColumns.length,
					enableSorting,
					isLoading,
				}}
			>
				<Table.Container>
					<Table.Toolbar>
						<Table.Heading>
							<PuzzlePiece size={16} weight="fill" className="text-subtle" />
							Balances
						</Table.Heading>
						{/* <Table.Actions>
							<ShowExpiredActionButton
								showExpired={showExpired}
								setShowExpired={setShowExpired}
							/>
						</Table.Actions> */}
					</Table.Toolbar>
					{hasBalances ? (
						<>
							{/* <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-2">
								{allEnts.map((ent) => {
									const featureId = ent.entitlement.feature.id;
									const isBoolean =
										ent.entitlement.feature.type === FeatureType.Boolean;

									// Boolean entitlements: simplified card
									if (isBoolean) {
										return (
											<div
												key={ent.entitlement.feature.id}
												className={cn(
													"flex items-center justify-between gap-2 px-4 min-w-60 text-t2 text-sm whitespace-nowrap bg-interactive-secondary border rounded-lg shadow-sm overflow-hidden relative h-16",
													allEnts.length === 1 && "max-w-[50%]",
												)}
											>
												<span className="font-medium text-t1">
													{ent.entitlement.feature.name}
												</span>
												<CustomerFeatureConfiguration
													feature={ent.entitlement.feature}
												/>
											</div>
										);
									}

									//if not a boolean, return a metered feature balance card
									return (
										<MeteredFeatureBalanceCard
											key={ent.entitlement.feature.id}
											ent={ent}
											filteredCustomerProducts={filteredCustomerProducts}
											featureId={featureId}
											entityId={entityId}
											aggregatedMap={aggregatedMap}
											allEnts={allEnts}
										/>
									);
								})}
							</div> */}
							<div className="flex flex-col gap-3">
								<CustomerBalanceTable
									allEnts={allEnts.filter(
										(ent) =>
											ent.entitlement.feature.type !== FeatureType.Boolean,
									)}
									filteredCustomerProducts={filteredCustomerProducts}
									entityId={entityId}
									aggregatedMap={aggregatedMap}
									isLoading={isLoading}
								/>
								{allEnts.some(
									(ent) => ent.entitlement.feature.type === FeatureType.Boolean,
								) && (
									<CustomerBooleanBalanceTable
										allEnts={allEnts.filter(
											(ent) =>
												ent.entitlement.feature.type === FeatureType.Boolean,
										)}
										aggregatedMap={aggregatedMap}
										isLoading={isLoading}
									/>
								)}
							</div>
						</>
					) : (
						!isLoading && (
							<EmptyState text="Enable a plan to grant access to features" />
						)
					)}
					{/* <Table.Content>
						<Table.Header />
						<Table.Body />
					</Table.Content> */}
				</Table.Container>
			</Table.Provider>
		</div>
	);
}
