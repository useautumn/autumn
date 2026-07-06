import type { LicensePoolResponse } from "@autumn/shared";
import { DropdownMenuItem } from "@autumn/ui";
import type { Row } from "@tanstack/react-table";
import { useMemo } from "react";
import {
	hiddenSkeleton,
	nameWithIconSkeleton,
	Table,
	TableDropdownMenuCell,
} from "@/components/general/table";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
import { useCustomerTable } from "@/views/customers2/hooks/useCustomerTable";
import { createDateTimeColumn } from "@/views/customers2/utils/ColumnHelpers";
import { AssignLicenseButton } from "./AssignLicenseButton";
import { useCustomerLicenseActions } from "./useCustomerLicenseActions";

interface LicenseAssignmentRow {
	id: string;
	name: string;
	started_at: number;
	pool: LicensePoolResponse;
}

export function CustomerLicensesSection() {
	const { customer, entityId } = useCustomerContext();
	const customerId = customer.id ?? customer.internal_id;

	// The URL's entity_id may hold the internal id (e.g. via the plans table's
	// Scope column), but the licenses API only resolves public entity ids.
	const publicEntityId = customer.entities?.find(
		(entity) => entity.id === entityId || entity.internal_id === entityId,
	)?.id;

	const { pools, isLoading, assignLicense, unassignLicense, isAssigning } =
		useCustomerLicenseActions({
			customerId,
			entityId: publicEntityId ?? undefined,
		});

	const rows = useMemo<LicenseAssignmentRow[]>(
		() =>
			pools.flatMap((pool) =>
				pool.assignments
					.filter((assignment) => assignment.entity_id === publicEntityId)
					.map((assignment) => ({
						id: assignment.assignment_id,
						name: pool.license_product_name,
						started_at: assignment.started_at,
						pool,
					})),
			),
		[pools, publicEntityId],
	);

	const columns = useMemo(
		() => [
			{
				header: "Name",
				accessorKey: "name",
				size: 150,
				meta: { skeleton: nameWithIconSkeleton },
				cell: ({ row }: { row: Row<LicenseAssignmentRow> }) => (
					<div className="font-medium text-foreground flex items-center gap-2">
						<LicenseIcon size={14} className="text-subtle shrink-0" />
						{row.original.name}
					</div>
				),
			},
			{
				header: "Availability",
				accessorKey: "availability",
				size: 150,
				cell: ({ row }: { row: Row<LicenseAssignmentRow> }) => {
					const { inventory } = row.original.pool;
					const total = inventory.included_quantity + inventory.paid_quantity;
					return (
						<span className="text-tertiary-foreground">
							{inventory.available} of {total} available
						</span>
					);
				},
			},
			{
				...createDateTimeColumn<LicenseAssignmentRow>({
					header: "Assigned At",
					accessorKey: "started_at",
					withYear: true,
				}),
				size: 150,
			},
			{
				id: "actions",
				header: "",
				size: 40,
				meta: { skeleton: hiddenSkeleton },
				cell: ({ row }: { row: Row<LicenseAssignmentRow> }) => (
					<div className="flex justify-end">
						<TableDropdownMenuCell>
							<DropdownMenuItem
								onClick={() =>
									unassignLicense({
										pool: row.original.pool,
										assignmentId: row.original.id,
									})
								}
							>
								Unassign
							</DropdownMenuItem>
						</TableDropdownMenuCell>
					</div>
				),
			},
		],
		[unassignLicense],
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
							onAssign={assignLicense}
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
