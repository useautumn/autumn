import { FeatureType } from "@autumn/shared";
import { type ExpandedState, getExpandedRowModel } from "@tanstack/react-table";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { ShowExpiredActionButton } from "../customer-products/ShowExpiredActionButton";
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
		parseAsBoolean.withDefault(true),
	);

	const [expanded, setExpanded] = useState<ExpandedState>({});

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
			}),
		[cusEnts, deduplicatedCusEnts, featuresMap],
	);

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

	const booleanTable = useCustomerTable<CustomerFeatureUsageRowData>({
		data: booleanEnts,
		columns: CustomerFeatureUsageColumns,
	});

	return (
		<>
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
						<Table.Heading>Feature Usage</Table.Heading>
						<Table.Actions>
							<ShowExpiredActionButton
								showExpired={showExpired}
								setShowExpired={setShowExpired}
							/>
						</Table.Actions>
					</Table.Toolbar>
					<Table.Content>
						<Table.Header />
						<Table.Body />
					</Table.Content>
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
