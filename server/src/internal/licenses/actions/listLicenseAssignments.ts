import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { serializeLicenseAssignment } from "../licenseResponseUtils.js";
import { getLicenseProduct } from "../licenseUtils.js";
import { licenseAssignmentRepo } from "../repos/index.js";

export const listLicenseAssignments = async ({
	ctx,
	customerId,
	entityId,
	planId,
	active = true,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	planId?: string;
	active?: boolean;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	const licenseProduct = planId
		? await getLicenseProduct({
				db: ctx.db,
				idOrInternalId: planId,
				orgId: ctx.org.id,
				env: ctx.env,
			})
		: undefined;

	const rows = await licenseAssignmentRepo.listWithEntityAndProductByCustomer({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		internalCustomerId: fullCustomer.internal_id,
		entityId,
		licenseInternalProductId: licenseProduct?.internal_id,
		activeOnly: active,
	});

	return rows.map(({ assignment, entity_id, license_product_id }) =>
		serializeLicenseAssignment({
			assignment,
			entityId: entity_id ?? assignment.internal_entity_id,
			licenseProductId:
				license_product_id ?? assignment.license_internal_product_id,
		}),
	);
};
