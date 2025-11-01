import type {
	CreditSchemaItem,
	FullCusEntWithFullCusProduct,
	FullCusProduct,
	FullCustomerEntitlement,
} from "@autumn/shared";
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
import type {
	CustomerFeatureUsageRowData,
	FullCusEntWithSubRows,
} from "./customerFeatureUsageTypes";

export function CustomerFeatureUsageTable() {
	const { customer, features, isLoading } = useCusQuery();

	const [showExpired, setShowExpired] = useQueryState(
		"customerFeatureUsageShowExpired",
		parseAsBoolean.withDefault(true),
	);

	const [expanded, setExpanded] = useState<ExpandedState>({});

	const cusEnts = useMemo(
		() =>
			customer?.customer_products.flatMap((cp: FullCusProduct) =>
				cp.customer_entitlements.map((e: FullCustomerEntitlement) => ({
					...e,
					customer_product: cp,
				})),
			) ?? [],
		[customer],
	);

	const featuresMap = useMemo(() => {
		if (!features) return new Map();
		return new Map(features.map((f) => [f.id, f]));
	}, [features]);

	const filteredCusEnts = useMemo(
		() =>
			filterCustomerFeatureUsage({
				entitlements: cusEnts,
				showExpired: showExpired ?? true,
			}),
		[cusEnts, showExpired],
	);

	const deduplicatedCusEnts = useMemo(() => {
		// Group by feature ID
		const featureMap = new Map<string, FullCusEntWithFullCusProduct[]>();

		for (const ent of filteredCusEnts) {
			const featureId = ent.entitlement.feature.id;
			if (!featureMap.has(featureId)) {
				featureMap.set(featureId, []);
			}
			featureMap.get(featureId)?.push(ent);
		}

		const combined: FullCusEntWithFullCusProduct[] = [];

		for (const ents of featureMap.values()) {
			if (ents.length === 1) {
				// No duplicates, use as-is
				combined.push(ents[0]);
			} else {
				// Combine multiple entitlements
				const first = ents[0];
				const summedBalance = ents.reduce(
					(sum, e) => sum + (e.balance ?? 0),
					0,
				);
				const summedAllowance = ents.reduce(
					(sum, e) => sum + (e.entitlement.allowance ?? 0),
					0,
				);
				const summedQuantity = ents.reduce(
					(sum, e) => sum + (e.customer_product.quantity ?? 1),
					0,
				);
				const earliestReset = ents.reduce(
					(earliest, e) => {
						if (!e.next_reset_at) return earliest;
						if (!earliest) return e.next_reset_at;
						return Math.min(earliest, e.next_reset_at);
					},
					null as number | null,
				);

				combined.push({
					...first,
					balance: summedBalance,
					entitlement: {
						...first.entitlement,
						allowance: summedAllowance,
					},
					customer_product: {
						...first.customer_product,
						quantity: summedQuantity,
					},
					next_reset_at: earliestReset ?? first.next_reset_at,
				});
			}
		}

		return combined;
	}, [filteredCusEnts]);

	const nonBooleanEnts = useMemo(() => {
		// Create a map of feature id to customer entitlements for quick lookup
		const featureIdToCusEnt = new Map(
			cusEnts.map((ent: FullCusEntWithFullCusProduct) => [
				ent.entitlement.feature.id,
				ent,
			]),
		);

		return deduplicatedCusEnts
			.filter(
				(ent: FullCusEntWithFullCusProduct) =>
					ent.entitlement.feature.type !== FeatureType.Boolean,
			)
			.map((ent: FullCusEntWithFullCusProduct): FullCusEntWithSubRows => {
				if (ent.entitlement.feature.type === FeatureType.CreditSystem) {
					const creditSchema = ent.entitlement.feature.config?.schema || [];
					const subRows = creditSchema.map((schemaItem: CreditSchemaItem) => {
						const meteredFeature = featuresMap.get(
							schemaItem.metered_feature_id,
						);
						// Find the customer entitlement for this metered feature
						const meteredCusEnt = featureIdToCusEnt.get(
							schemaItem.metered_feature_id,
						);

						return {
							metered_feature_id: schemaItem.metered_feature_id,
							credit_amount: schemaItem.credit_amount,
							feature_amount: schemaItem.feature_amount,
							feature: meteredFeature,
							meteredCusEnt, // Include the customer entitlement with usage data
							isSubRow: true,
							// Copy parent data for table context
							entitlement: ent.entitlement,
							customer_product: ent.customer_product,
							next_reset_at: ent.next_reset_at,
						};
					});
					return { ...ent, subRows };
				}
				return ent;
			});
	}, [cusEnts, deduplicatedCusEnts, featuresMap]);

	const booleanEnts = useMemo(
		() =>
			deduplicatedCusEnts.filter(
				(ent: FullCusEntWithFullCusProduct) =>
					ent.entitlement.feature.type === FeatureType.Boolean,
			),
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
