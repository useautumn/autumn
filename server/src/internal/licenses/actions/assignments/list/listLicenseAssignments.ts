import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { serializeLicenseAssignment } from "../../../licenseResponseUtils.js";
import { getFullLicenseProduct } from "../../../licenseUtils.js";
import { licenseAssignmentRepo } from "../../../repos/licenseAssignmentRepo.js";

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
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: customerId, entity_id: entityId },
	});
	const licenseProduct = planId
		? await getFullLicenseProduct({ ctx, idOrInternalId: planId })
		: undefined;

	const rows =
		await licenseAssignmentRepo.listAssignmentsWithEntityAndProductByCustomer({
			db: ctx.db,
			internalCustomerId: fullCustomer.internal_id,
			entityId,
			licenseInternalProductId: licenseProduct?.internal_id,
			activeOnly: active,
		});

	return rows.map(({ assignment, entity_id, license_product_id }) =>
		serializeLicenseAssignment({
			assignment,
			entityId: entity_id ?? "",
			licenseProductId: license_product_id,
		}),
	);
};
