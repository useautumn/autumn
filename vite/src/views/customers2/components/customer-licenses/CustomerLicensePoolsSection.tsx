import { filterCustomerProductsByActiveStatuses } from "@autumn/shared";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import {
	type CustomerLicensePoolRow,
	customerLicensePoolColumns,
} from "./customerLicensePoolColumns";

/** Customer-level license pools (used/granted seats per license), read
 * straight off the full customer's hydrated customer_licenses. */
export function CustomerLicensePoolsSection() {
	const { customer, entityId } = useCustomerContext();

	const rows = useMemo<CustomerLicensePoolRow[]>(
		() =>
			filterCustomerProductsByActiveStatuses({
				customerProducts: customer.customer_products,
			}).flatMap((customerProduct) =>
				(customerProduct.customer_licenses ?? []).map((customerLicense) => ({
					id: customerLicense.id,
					name:
						customerLicense.planLicense?.product.name ??
						customerLicense.license_internal_product_id,
					parentPlanName: customerProduct.product.name,
					remaining: customerLicense.remaining,
					granted: customerLicense.granted,
					paidQuantity: customerLicense.paid_quantity,
					createdAt: customerLicense.created_at,
				})),
			),
		[customer.customer_products],
	);

	const table = useCustomerTable({
		data: rows,
		columns: customerLicensePoolColumns,
	});

	// Entity view shows per-entity assignments via CustomerLicensesSection.
	if (entityId || rows.length === 0) return null;

	return (
		<Table.Provider
			config={{
				table,
				numberOfColumns: customerLicensePoolColumns.length,
				enableSorting: false,
				isLoading: false,
				emptyStateChildren: "No licenses",
				flexibleTableColumns: true,
				mobileCards: true,
			}}
		>
			<Table.Container>
				<Table.Toolbar>
					<Table.Heading>
						<LicenseIcon size={16} className="text-subtle" />
						Licenses
					</Table.Heading>
				</Table.Toolbar>
				<Table.Content>
					<Table.Body />
				</Table.Content>
			</Table.Container>
		</Table.Provider>
	);
}
