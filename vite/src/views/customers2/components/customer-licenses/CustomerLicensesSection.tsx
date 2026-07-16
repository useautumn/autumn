import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { AssignLicenseButton } from "./AssignLicenseButton";
import {
	createCustomerLicenseColumns,
	type LicenseAssignmentRow,
} from "./customerLicenseColumns";
import { resolveCustomerLicenseProduct } from "./resolveCustomerLicenseProduct";
import { useCustomerLicenseBalances } from "./useCustomerLicenseBalances";

export function CustomerLicensesSection() {
	const {
		publicEntityId,
		pools,
		assignments,
		isLoading,
		attachLicense,
		cancelLicenseAssignment,
		isAssigning,
	} = useCustomerLicenseBalances();

	const selectedItemId = useSheetStore((s) => s.itemId);
	const setSheet = useSheetStore((s) => s.setSheet);

	const entityAssignments = useMemo(
		() =>
			assignments.filter(
				(assignment) => assignment.entity_id === publicEntityId,
			),
		[assignments, publicEntityId],
	);

	const { licenseProducts } = useLicenseProductsQuery();
	const { customer } = useCustomerContext();

	const rows = useMemo<LicenseAssignmentRow[]>(() => {
		const poolByLicensePlanId = new Map(
			pools.map((pool) => [pool.license_plan_id, pool]),
		);
		return entityAssignments.flatMap((assignment) => {
			const pool = poolByLicensePlanId.get(assignment.license_plan_id);
			if (!pool) return [];
			return [
				{
					id: assignment.id,
					name: pool.license_plan_name,
					product: resolveCustomerLicenseProduct({
						customer,
						licensePlanId: pool.license_plan_id,
						parentPlanId: pool.parent_plan_id,
						catalogProduct: licenseProducts.find(
							(license) => license.id === pool.license_plan_id,
						),
					}),
					started_at: assignment.started_at,
					pool,
				},
			];
		});
	}, [pools, entityAssignments, licenseProducts, customer]);

	const entity = customer.entities?.find((e) => e.id === publicEntityId);

	const columns = useMemo(
		() =>
			createCustomerLicenseColumns({
				onUnassign: (row) =>
					cancelLicenseAssignment({
						entityId: publicEntityId ?? "",
						licensePlanId: row.pool.license_plan_id,
					}),
				entityName: entity?.name ?? entity?.id ?? publicEntityId ?? undefined,
			}),
		[cancelLicenseAssignment, publicEntityId, entity],
	);

	const table = useCustomerTable({ data: rows, columns });

	if (!publicEntityId || isLoading || pools.length === 0) return null;

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: columns.length,
				enableSorting: false,
				isLoading: false,
				emptyStateChildren: "No licenses assigned to this entity",
				flexibleTableColumns: true,
				mobileCards: true,
				selectedItemId,
				onRowClick: (row: LicenseAssignmentRow) =>
					setSheet({ type: "license-detail", itemId: row.id }),
			}}
		>
			<Table.Container>
				<Table.Toolbar>
					<Table.Heading>
						<LicenseIcon size={16} className="text-subtle" />
						Licenses
					</Table.Heading>
					<Table.Actions>
						<AssignLicenseButton
							pools={pools}
							entityAssignments={entityAssignments}
							onAssign={attachLicense}
							isAssigning={isAssigning}
						/>
					</Table.Actions>
				</Table.Toolbar>
				<Table.Content>
					<Table.Body />
				</Table.Content>
			</Table.Container>
		</Table.Provider>
	);
}
