import type { LicenseAssignmentCustomerProduct } from "./licenseTypes.js";

export const serializeLicenseAssignment = ({
	assignment,
	entityId,
	licenseProductId,
	parentEndedAt,
}: {
	assignment: LicenseAssignmentCustomerProduct;
	entityId: string;
	licenseProductId: string;
	parentEndedAt?: string | number | null;
}) => ({
	id: assignment.id,
	entity_id: entityId,
	license_plan_id: licenseProductId,
	started_at: assignment.created_at,
	ended_at:
		assignment.ended_at ??
		(parentEndedAt === null || parentEndedAt === undefined
			? null
			: Number(parentEndedAt)),
});
