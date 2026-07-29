import type { LicenseAssignmentCustomerProduct } from "./licenseTypes.js";

export const serializeLicenseAssignment = ({
	assignment,
	entityId,
	licenseProductId,
}: {
	assignment: LicenseAssignmentCustomerProduct;
	entityId: string;
	licenseProductId: string;
}) => ({
	id: assignment.id,
	entity_id: entityId,
	license_plan_id: licenseProductId,
	started_at: assignment.created_at,
	ended_at: assignment.ended_at ?? null,
});
