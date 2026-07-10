import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { AssignLicenseButton } from "./AssignLicenseButton";
import {
	createCustomerLicenseColumns,
	type LicenseAssignmentRow,
} from "./customerLicenseColumns";
import { useCustomerLicenseBalances } from "./useCustomerLicenseBalances";

export function CustomerLicensesSection() {
	const {
		publicEntityId,
		pools,
		isLoading,
		attachLicense,
		cancelLicenseAssignment,
		isAssigning,
	} = useCustomerLicenseBalances();

	const selectedItemId = useSheetStore((s) => s.itemId);
	const setSheet = useSheetStore((s) => s.setSheet);

	const rows = useMemo<LicenseAssignmentRow[]>(
		() =>
			pools.flatMap((pool) =>
				pool.assignments
					.filter((assignment) => assignment.entity_id === publicEntityId)
					.map((assignment) => ({
						id: assignment.assignment_id,
						name: pool.license_plan_name,
						started_at: assignment.started_at,
						pool,
					})),
			),
		[pools, publicEntityId],
	);

	const columns = useMemo(
		() =>
			createCustomerLicenseColumns({
				onUnassign: (row) => cancelLicenseAssignment({ assignmentId: row.id }),
			}),
		[cancelLicenseAssignment],
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
							entityId={publicEntityId}
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
