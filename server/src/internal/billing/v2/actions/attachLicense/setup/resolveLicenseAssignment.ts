import type { Entity, FullCustomer, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo.js";
import { buildLicenseCustomerProduct } from "../compute/buildLicenseCustomerProduct.js";
import { resolveAssignableLicenseParent } from "../compute/resolveAssignableLicenseParent.js";
import type { LicenseAssignmentResolution } from "../types.js";

/** Resolves the assignment against the DB: idempotency, the assignable parent
 * and its effective product, and the provisioned customer product. All I/O
 * happens here so compute is a pure plan assembly. */
export const resolveLicenseAssignment = async ({
	ctx,
	fullCustomer,
	entity,
	licenseProduct,
	planId,
	parentPlanId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	entity: Entity;
	licenseProduct: FullProduct;
	planId: string;
	parentPlanId?: string;
}): Promise<LicenseAssignmentResolution> => {
	const {
		parent,
		licenseDefinition,
		licenseProduct: pinnedLicenseProduct,
		effectiveProduct,
		available,
	} = await resolveAssignableLicenseParent({
		ctx,
		fullCustomer,
		licenseProduct,
		planId,
		parentPlanId,
	});

	// Idempotency checks against the link's pinned version — the version the
	// entity would actually be assigned.
	const existing = await licenseAssignmentRepo.findActiveAssignment({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
		internalEntityId: entity.internal_id,
		licenseInternalProductId: licenseDefinition.license_internal_product_id,
	});
	if (existing) return { existing };

	const provisioned = await buildLicenseCustomerProduct({
		ctx,
		fullCustomer,
		licenseProduct: pinnedLicenseProduct,
		licenseDefinition,
		internalEntityId: entity.internal_id,
		licenseParentCustomerProductId: parent.id,
	});

	return {
		parent,
		licenseDefinition,
		effectiveProduct,
		available,
		provisioned,
	};
};
