import {
	type AutumnBillingPlan,
	type CustomizePlanLicense,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type ActiveParentAssignment,
	getActiveAssignmentsForParent,
} from "./getActiveAssignmentsForParent.js";
import { resolveDesiredLicenses } from "./resolveDesiredLicenses.js";

const findLicenseCapacityConflicts = ({
	assignments,
	desiredByInternalProductId,
}: {
	assignments: ActiveParentAssignment[];
	desiredByInternalProductId: Map<string, CustomizePlanLicense>;
}) => {
	const assignmentsByLicense = new Map<string, ActiveParentAssignment[]>();
	for (const assignment of assignments) {
		const group =
			assignmentsByLicense.get(assignment.licenseInternalProductId) ?? [];
		group.push(assignment);
		assignmentsByLicense.set(assignment.licenseInternalProductId, group);
	}

	return [...assignmentsByLicense.values()]
		.map((group) => ({
			license_plan_id: group[0].licenseProductId,
			requested_quantity:
				desiredByInternalProductId.get(group[0].licenseInternalProductId)
					?.included_quantity ?? 0,
			active_assignments: group.length,
			assignment_ids: group.map((assignment) => assignment.assignmentId),
			entity_ids: group
				.map((assignment) => assignment.entityId)
				.filter((entityId): entityId is string => Boolean(entityId)),
		}))
		.filter(
			(conflict) => conflict.active_assignments > conflict.requested_quantity,
		);
};

export const validateCustomLicenseChanges = async ({
	ctx,
	customLicenses,
}: {
	ctx: AutumnContext;
	customLicenses?: AutumnBillingPlan["customLicenses"];
}) => {
	if (!customLicenses?.length) return;

	for (const change of customLicenses) {
		const desired = await resolveDesiredLicenses({
			ctx,
			licenses: change.licenses,
		});
		const desiredByInternalProductId = new Map(
			desired.map(({ params, product }) => [product.internal_id, params]),
		);
		const assignments = await getActiveAssignmentsForParent({
			ctx,
			parentCustomerProductId:
				change.previousParentCustomerProductId ??
				change.parentCustomerProductId,
		});

		const invalid = findLicenseCapacityConflicts({
			assignments,
			desiredByInternalProductId,
		});

		if (invalid.length > 0) {
			throw new RecaseError({
				message:
					"Custom license changes conflict with active license assignments.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
				data: { conflicts: invalid },
			});
		}
	}
};
