import type {
	Entity,
	FullCusEntWithFullCusProduct,
	FullCustomerEntitlement,
} from "@autumn/shared";
import { FeatureType, type FullCusProduct } from "@autumn/shared";
import { CubeIcon, PlusIcon } from "@phosphor-icons/react";
import { type ExpandedState, getExpandedRowModel } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { SectionTag } from "@/components/v2/badges/SectionTag";
import { Button } from "@/components/v2/buttons/Button";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { CustomerBalanceTable } from "../customer-balance/CustomerBalanceTable";
import { EmptyState } from "../EmptyState";
import { CustomerFeatureUsageColumns } from "./CustomerFeatureUsageColumns";
import { CustomerFlagsSection } from "./CustomerFlagsSection";
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
	const { setSheet } = useSheetStore();

	const { entityId } = useEntity();

	const [expanded, setExpanded] = useState<ExpandedState>({});

	const selectedEntity = useMemo(() => {
		if (!entityId) return null;
		return customer?.entities.find(
			(e: Entity) => e.id === entityId || e.internal_id === entityId,
		);
	}, [customer?.entities, entityId]);

	const filteredCustomerProducts = useMemo(() => {
		if (!selectedEntity) {
			return customer?.customer_products ?? [];
		}

		return (customer?.customer_products ?? []).filter(
			(cp: FullCusProduct) =>
				(!cp.internal_entity_id && !cp.entity_id) ||
				cp.internal_entity_id === selectedEntity.internal_id ||
				cp.entity_id === selectedEntity.id,
		);
	}, [customer?.customer_products, selectedEntity]);

	const cusEnts = useMemo((): FullCusEntWithFullCusProduct[] => {
		const productEnts = flattenCustomerEntitlements({
			customerProducts: filteredCustomerProducts,
		});

		// Add extra entitlements (loose entitlements not tied to a product)
		// Customer level: show ALL loose entitlements (customer can access entity-scoped balances at top level)
		// Entity level: show ONLY that entity's loose entitlements
		const extraEnts: FullCusEntWithFullCusProduct[] = (
			customer?.extra_customer_entitlements || []
		)
			.filter((ent: FullCustomerEntitlement) => {
				// If no entity selected (customer level), show ALL loose entitlements
				if (!selectedEntity) {
					return true;
				}
				// If entity selected, show ONLY that entity's loose entitlements
				return ent.internal_entity_id === selectedEntity.internal_id;
			})
			.map((ent: FullCustomerEntitlement) => ({
				...ent,
				customer_product: null,
			}));

		return [...productEnts, ...extraEnts];
	}, [
		filteredCustomerProducts,
		customer?.extra_customer_entitlements,
		selectedEntity,
	]);

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
			}).sort((a, b) => {
				const aAllowance = a.entitlement.allowance ?? 0;
				const bAllowance = b.entitlement.allowance ?? 0;
				if (aAllowance > 0 && bAllowance <= 0) return -1;
				if (bAllowance > 0 && aAllowance <= 0) return 1;
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

	// Strip CreditSystemSubRow subRows — CustomerBalanceTable uses aggregatedMap for its own sub-rows
	const balanceEnts = useMemo(
		() => meteredEnts.map(({ subRows, ...rest }) => rest),
		[meteredEnts],
	);

	const booleanEnts = useMemo(
		() =>
			deduplicatedCusEnts.filter(
				(ent) => ent.entitlement.feature.type === FeatureType.Boolean,
			),
		[deduplicatedCusEnts],
	);

	const hasMeteredBalances = balanceEnts.length > 0;
	const hasBooleanFlags = booleanEnts.length > 0;

	return (
		<div className="flex flex-col gap-6">
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
							<CubeIcon size={16} weight="fill" className="text-subtle" />
							Features
						</Table.Heading>
						<Table.Actions>
							<Button
								variant="secondary"
								size="mini"
								className="gap-2 font-medium"
								onClick={() => setSheet({ type: "balance-create" })}
							>
								<PlusIcon className="size-3.5" />
								Create Balance
							</Button>
						</Table.Actions>
					</Table.Toolbar>
					{hasBooleanFlags && <SectionTag>Balances</SectionTag>}
					{hasMeteredBalances ? (
						<CustomerBalanceTable
							allEnts={balanceEnts}
							entityId={entityId ?? null}
							aggregatedMap={aggregatedMap}
							isLoading={isLoading}
						/>
					) : (
						!isLoading &&
						!hasBooleanFlags && (
							<EmptyState text="Enable a plan to grant access to features" />
						)
					)}
				</Table.Container>
			</Table.Provider>
			{!isLoading && hasBooleanFlags && (
				<CustomerFlagsSection booleanEnts={booleanEnts} />
			)}
		</div>
	);
}
