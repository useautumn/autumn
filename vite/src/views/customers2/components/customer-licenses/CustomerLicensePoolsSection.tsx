import type { ApiCustomerLicenseV0 } from "@autumn/shared";
import {
	filterCustomerProductsByActiveStatuses,
	mapToProductV2,
} from "@autumn/shared";
import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { useLicenseBalancesQuery } from "@/hooks/queries/useLicenseBalancesQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { AssignLicenseButton } from "./AssignLicenseButton";
import { AssignLicenseToEntityDialog } from "./AssignLicenseToEntityDialog";
import {
	type CustomerLicensePoolRow,
	createCustomerLicensePoolColumns,
} from "./customerLicensePoolColumns";

/** Customer-level license pools (used/granted seats per license), read
 * straight off the full customer's hydrated customer_licenses. */
export function CustomerLicensePoolsSection() {
	const { customer, entityId } = useCustomerContext();
	const selectedItemId = useSheetStore((s) => s.itemId);
	const setSheet = useSheetStore((s) => s.setSheet);

	const customerId = customer.id ?? customer.internal_id;
	// Customer-level pools (no entity scope) power the assign dropdown.
	const { pools, assign } = useLicenseBalancesQuery({
		customerId,
		enabled: !entityId,
	});
	const [assignPool, setAssignPool] = useState<ApiCustomerLicenseV0 | null>(
		null,
	);

	const rows = useMemo<CustomerLicensePoolRow[]>(
		() =>
			filterCustomerProductsByActiveStatuses({
				customerProducts: customer.customer_products,
			}).flatMap((customerProduct) =>
				(customerProduct.customer_licenses ?? []).map((customerLicense) => ({
					id: customerLicense.id,
					licensePlanId: customerLicense.planLicense?.product.id ?? null,
					name:
						customerLicense.planLicense?.product.name ??
						customerLicense.license_internal_product_id,
					product: customerLicense.planLicense
						? mapToProductV2({ product: customerLicense.planLicense.product })
						: null,
					remaining: customerLicense.remaining,
					granted: customerLicense.granted,
					paidQuantity: customerLicense.paid_quantity,
					createdAt: customerLicense.created_at,
				})),
			),
		[customer.customer_products],
	);

	const columns = useMemo(
		() =>
			createCustomerLicensePoolColumns({
				hasEntities: customer.entities.length > 0,
			}),
		[customer.entities.length],
	);

	const table = useCustomerTable({ data: rows, columns });

	// Entity view shows per-entity assignments via CustomerLicensesSection.
	if (entityId || rows.length === 0) return null;

	return (
		<>
			<Table.Provider
				config={{
					table,
					numberOfColumns: columns.length,
					enableSorting: false,
					isLoading: false,
					emptyStateChildren: "No licenses",
					flexibleTableColumns: true,
					mobileCards: true,
					selectedItemId,
					onRowClick: (row: CustomerLicensePoolRow) => {
						if (!row.licensePlanId) return;
						setSheet({
							type: "license-pool-detail",
							itemId: row.licensePlanId,
						});
					},
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
								entityAssignments={[]}
								isAssigning={assign.isPending}
								onAssign={setAssignPool}
								pools={pools}
							/>
						</Table.Actions>
					</Table.Toolbar>
					<Table.Content>
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</Table.Provider>

			<AssignLicenseToEntityDialog
				assign={assign}
				customerId={customerId}
				hasEntities={customer.entities.length > 0}
				onClose={() => setAssignPool(null)}
				pool={assignPool}
			/>
		</>
	);
}
