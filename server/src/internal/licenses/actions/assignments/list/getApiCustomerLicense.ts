import type { ApiCustomerLicenseV0 } from "@autumn/shared";
import { computeLicenseInventory } from "../../../licenseUtils.js";
import type {
	CustomerLicenseState,
	LicenseAssignmentRow,
} from "../../reconcile/types.js";

const groupAssignmentsByCustomerLicenseId = ({
	assignments,
	entityId,
}: {
	assignments: LicenseAssignmentRow[];
	entityId?: string;
}) => {
	const scoped = entityId
		? assignments.filter((row) => row.entity_id === entityId)
		: assignments;
	const byCustomerLicenseId = new Map<string, LicenseAssignmentRow[]>();
	for (const row of scoped) {
		const customerLicenseId = row.assignment.customer_license_id;
		if (!customerLicenseId) continue;
		byCustomerLicenseId.set(customerLicenseId, [
			...(byCustomerLicenseId.get(customerLicenseId) ?? []),
			row,
		]);
	}
	return byCustomerLicenseId;
};

/** Serializes a customer's license state to the API shape — each customer
 * license row is the source of truth for what the customer has. Pure; the
 * caller fetches the assignment rows and passes them in. */
export const getApiCustomerLicense = ({
	state,
	assignments,
	entityId,
}: {
	state: CustomerLicenseState;
	assignments: LicenseAssignmentRow[];
	entityId?: string;
}): ApiCustomerLicenseV0[] => {
	const assignmentsByCustomerLicenseId = groupAssignmentsByCustomerLicenseId({
		assignments,
		entityId,
	});
	// Scheduled parents' rows exist from insert but aren't inventory until
	// activation makes the parent live.
	const liveParentIds = new Set(
		state.parentCustomerProducts.map((parent) => parent.id),
	);

	return state.customerLicenses
		.flatMap((customerLicense) => {
			const { license } = customerLicense;
			if (!license) return [];
			if (!liveParentIds.has(customerLicense.parent_customer_product_id)) {
				return [];
			}

			const assignmentRows =
				assignmentsByCustomerLicenseId.get(customerLicense.id) ?? [];
			return [
				{
					parent_plan_id: license.parent_plan_id,
					license_plan_id: license.license_plan_id,
					license_plan_name: license.product.name ?? "",
					inventory: computeLicenseInventory({
						included: customerLicense.granted,
						assigned: customerLicense.granted - customerLicense.remaining,
					}),
					assignments: assignmentRows.map(({ assignment, entity_id }) => ({
						assignment_id: assignment.id,
						entity_id: entity_id ?? "",
						license_plan_id: license.license_plan_id,
						started_at: assignment.created_at ?? 0,
					})),
				},
			];
		})
		.sort(
			(a, b) =>
				a.parent_plan_id.localeCompare(b.parent_plan_id) ||
				a.license_plan_id.localeCompare(b.license_plan_id),
		);
};
