import type { DbLicenseAssignment, DbPlanLicense } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { licenseAssignmentRepo } from "./repos/index.js";

export const serializeLicenseAssignment = ({
	assignment,
	entityId,
	licenseProductId,
}: {
	assignment: DbLicenseAssignment;
	entityId: string;
	licenseProductId: string;
}) => ({
	id: assignment.id,
	entity_id: entityId,
	license_product_id: licenseProductId,
	started_at: assignment.started_at,
	ended_at: assignment.ended_at ?? null,
	metadata: assignment.metadata,
});

export const getLicenseAssignmentResponse = async ({
	ctx,
	assignment,
}: {
	ctx: AutumnContext;
	assignment: DbLicenseAssignment;
}) => {
	const [entity, licenseProduct] = await Promise.all([
		licenseAssignmentRepo.getEntityByInternalId({
			db: ctx.db,
			internalEntityId: assignment.internal_entity_id,
		}),
		licenseAssignmentRepo.getProductByInternalId({
			db: ctx.db,
			internalProductId: assignment.license_internal_product_id,
		}),
	]);

	return serializeLicenseAssignment({
		assignment,
		entityId: entity?.id ?? assignment.internal_entity_id,
		licenseProductId:
			licenseProduct?.id ?? assignment.license_internal_product_id,
	});
};

export const serializePlanLicense = ({
	planLicense,
	parentPlanId,
	licensePlanId,
}: {
	planLicense: DbPlanLicense;
	parentPlanId: string;
	licensePlanId: string;
}) => ({
	id: planLicense.id,
	parent_plan_id: parentPlanId,
	license_plan_id: licensePlanId,
	included_quantity: planLicense.included_quantity,
	allow_extra_quantity: planLicense.allow_extra_quantity,
	pooled_feature_ids: planLicense.pooled_feature_ids,
	customize: planLicense.customize,
	metadata: planLicense.metadata,
	created_at: planLicense.created_at,
	updated_at: planLicense.updated_at,
});
