import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import type { LicenseAssignmentCustomerProduct } from "./licenseTypes.js";
import { licenseAssignmentRepo } from "./repos/licenseAssignmentRepo.js";

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

export const getLicenseAssignmentResponse = async ({
	ctx,
	assignment,
}: {
	ctx: AutumnContext;
	assignment: LicenseAssignmentCustomerProduct;
}) => {
	const [entity, licenseProduct] = await Promise.all([
		assignment.internal_entity_id
			? licenseAssignmentRepo.getEntityByInternalId({
					db: ctx.db,
					internalEntityId: assignment.internal_entity_id,
				})
			: undefined,
		ProductService.getByInternalId({
			db: ctx.db,
			internalId: assignment.internal_product_id,
		}),
	]);

	return serializeLicenseAssignment({
		assignment,
		entityId: entity?.id ?? assignment.internal_entity_id ?? "",
		licenseProductId: licenseProduct?.id ?? assignment.internal_product_id,
	});
};
