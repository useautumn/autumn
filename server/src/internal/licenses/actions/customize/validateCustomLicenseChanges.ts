import { type AutumnBillingPlan, ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
import { licenseAssignmentRepo } from "../../repos/licenseAssignmentRepo.js";
import { resolveLicensePatch } from "./resolveLicensePatch.js";

const getActiveAssignmentsForParent = async ({
	ctx,
	parentCustomerProductId,
}: {
	ctx: AutumnContext;
	parentCustomerProductId: string;
}) => {
	const rows =
		await licenseAssignmentRepo.listAssignmentsWithEntityAndProductByCustomer({
			db: ctx.db,
			parentCustomerProductId,
		});
	return rows.map(({ assignment, entity_id, license_product_id }) => ({
		assignmentId: assignment.id,
		licenseInternalProductId: assignment.internal_product_id,
		licenseProductId: license_product_id,
		entityId: entity_id,
	}));
};

type ActiveParentAssignment = Awaited<
	ReturnType<typeof getActiveAssignmentsForParent>
>[number];

const findLicenseCapacityConflicts = ({
	assignments,
	requestedByInternalProductId,
}: {
	assignments: ActiveParentAssignment[];
	requestedByInternalProductId: Map<string, number>;
}) => {
	const assignmentsByLicense = new Map<string, ActiveParentAssignment[]>();
	for (const assignment of assignments) {
		const group =
			assignmentsByLicense.get(assignment.licenseInternalProductId) ?? [];
		group.push(assignment);
		assignmentsByLicense.set(assignment.licenseInternalProductId, group);
	}

	return [...assignmentsByLicense.values()]
		.filter((group) =>
			requestedByInternalProductId.has(group[0].licenseInternalProductId),
		)
		.map((group) => {
			const requestedQuantity =
				requestedByInternalProductId.get(group[0].licenseInternalProductId) ??
				0;
			return {
				license_plan_id: group[0].licenseProductId,
				requested_quantity: requestedQuantity,
				active_assignments: group.length,
				assignment_ids: group.map((assignment) => assignment.assignmentId),
				entity_ids: group
					.map((assignment) => assignment.entityId)
					.filter((entityId): entityId is string => Boolean(entityId)),
			};
		})
		.filter(
			({ active_assignments, requested_quantity }) =>
				active_assignments > requested_quantity,
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
		const parentProduct = change.parentInternalProductId
			? await getFullLicenseProduct({
					ctx,
					idOrInternalId: change.parentInternalProductId,
				})
			: undefined;
		const resolved = await resolveLicensePatch({
			ctx,
			adds: change.adds,
			removes: change.removes,
			parentProduct,
			parentCustomerProductId: change.parentCustomerProductId,
		});

		const requestedByInternalProductId = new Map<string, number>();
		for (const add of resolved.adds) {
			requestedByInternalProductId.set(
				add.licenseProduct.internal_id,
				add.included,
			);
		}
		for (const remove of resolved.removes) {
			requestedByInternalProductId.set(remove.licenseProduct.internal_id, 0);
		}

		const assignments = await getActiveAssignmentsForParent({
			ctx,
			parentCustomerProductId:
				change.previousParentCustomerProductId ??
				change.parentCustomerProductId,
		});

		const invalid = findLicenseCapacityConflicts({
			assignments,
			requestedByInternalProductId,
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
