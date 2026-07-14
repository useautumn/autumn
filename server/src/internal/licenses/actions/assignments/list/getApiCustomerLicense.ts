import type { ApiCustomerLicenseV0 } from "@autumn/shared";
import { computeLicenseInventory } from "../../../licenseUtils.js";
import type {
	CustomerLicenseState,
	LicenseAssignmentRow,
} from "../../reconcile/types.js";

const groupAssignmentsByCustomerLicenseLinkId = ({
	assignments,
	entityId,
}: {
	assignments: LicenseAssignmentRow[];
	entityId?: string;
}) => {
	const scoped = entityId
		? assignments.filter((row) => row.entity_id === entityId)
		: assignments;
	const byCustomerLicenseLinkId = new Map<string, LicenseAssignmentRow[]>();
	for (const row of scoped) {
		const customerLicenseLinkId = row.assignment.customer_license_link_id;
		if (!customerLicenseLinkId) continue;
		byCustomerLicenseLinkId.set(customerLicenseLinkId, [
			...(byCustomerLicenseLinkId.get(customerLicenseLinkId) ?? []),
			row,
		]);
	}
	return byCustomerLicenseLinkId;
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
	const assignmentsByCustomerLicenseLinkId =
		groupAssignmentsByCustomerLicenseLinkId({
			assignments,
			entityId,
		});
	// Scheduled parents' rows exist from insert but aren't inventory until
	// activation makes the parent live.
	const liveParentById = new Map(
		state.parentCustomerProducts.map((parent) => [parent.id, parent]),
	);

	return state.customerLicenses
		.flatMap((customerLicense) => {
			const { planLicense } = customerLicense;
			if (!planLicense) return [];
			const parent = liveParentById.get(
				customerLicense.parent_customer_product_id,
			);
			if (!parent) return [];

			const assignmentRows =
				assignmentsByCustomerLicenseLinkId.get(customerLicense.link_id) ?? [];
			return [
				{
					parent_plan_id: parent.product.id,
					license_plan_id: planLicense.product.id,
					license_plan_name: planLicense.product.name ?? "",
					inventory: computeLicenseInventory({
						included: customerLicense.granted,
						assigned: customerLicense.granted - customerLicense.remaining,
					}),
					assignments: assignmentRows.map(({ assignment, entity_id }) => ({
						assignment_id: assignment.id,
						entity_id: entity_id ?? "",
						license_plan_id: planLicense.product.id,
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
