import type { Entity } from "@autumn/shared";
import { FeatureType, type FullCusProduct } from "@autumn/shared";
import { BatteryHighIcon } from "@phosphor-icons/react";
import { type ExpandedState, getExpandedRowModel } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { CustomerBalanceTable } from "../customer-balance/CustomerBalanceTable";
import { CustomerBooleanBalanceTable } from "../customer-boolean-balance/CustomerBooleanBalanceTable";
import { EmptyState } from "../EmptyState";
import { CustomerFeatureUsageColumns } from "./CustomerFeatureUsageColumns";
import { filterCustomerFeatureUsage } from "./customerFeatureUsageTableFilters";
import type { CustomerFeatureUsageRowData } from "./customerFeatureUsageTypes";
import {
	createFeaturesMap,
	deduplicateEntitlements,
	flattenCustomerEntitlements,
	processNonBooleanEntitlements,
} from "./customerFeatureUsageUtils";

export function CustomerFeatureUsageTable() {
	const { customer, features, isLoading } = useCusQuery();

	const { entityId } = useEntity();

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

	const meteredEnts = useMemo(
		() =>
			allEnts.filter(
				(ent) => ent.entitlement.feature.type !== FeatureType.Boolean,
			),
		[allEnts],
	);

	const booleanEnts = useMemo(
		() =>
			allEnts.filter(
				(ent) => ent.entitlement.feature.type === FeatureType.Boolean,
			),
		[allEnts],
	);

	const hasMeteredBalances = meteredEnts.length > 0;
	const hasBooleanBalances = booleanEnts.length > 0;

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
							<BatteryHighIcon
								size={16}
								weight="fill"
								className="text-subtle"
							/>
							Balances
						</Table.Heading>
						{/* <Table.Actions>
							<ShowExpiredActionButton
								showExpired={showExpired}
								setShowExpired={setShowExpired}
							/>
						</Table.Actions> */}
					</Table.Toolbar>
					{hasMeteredBalances || hasBooleanBalances ? (
						<div className="flex flex-col gap-3">
							{hasMeteredBalances && (
								<CustomerBalanceTable
									allEnts={meteredEnts}
									filteredCustomerProducts={filteredCustomerProducts}
									entityId={entityId ?? null}
									aggregatedMap={aggregatedMap}
									isLoading={isLoading}
								/>
							)}
							{hasBooleanBalances && (
								<CustomerBooleanBalanceTable
									allEnts={booleanEnts}
									aggregatedMap={aggregatedMap}
									isLoading={isLoading}
								/>
							)}
						</div>
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
