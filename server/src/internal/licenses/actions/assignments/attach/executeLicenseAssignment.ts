import {
	type DbPlanLicense,
	ErrCode,
	type FullCusProduct,
	RecaseError,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerLicenseRepo } from "../../../repos/customerLicenseRepo.js";
import { provisionLicenseCustomerProduct } from "../utils/provisionLicenseCustomerProduct.js";
import type { LicenseAssignmentContext } from "./types.js";

// The atomic assignment take is the capacity guard; the partial
// unique index on active assignments backstops same-entity double assigns.
export const executeLicenseAssignment = async ({
	ctx,
	context,
	plan,
}: {
	ctx: AutumnContext;
	context: LicenseAssignmentContext;
	plan: { parent: FullCusProduct; licenseDefinition: DbPlanLicense };
}) => {
	const { fullCustomer, entity, licenseProduct, planId } = context;
	const { parent, licenseDefinition } = plan;

	return await ctx.db.transaction(async (tx) => {
		const txCtx = { ...ctx, db: tx as unknown as DrizzleCli };
		const balance = await customerLicenseRepo.upsertGranted({
			db: txCtx.db,
			internalCustomerId: fullCustomer.internal_id,
			parentCustomerProductId: parent.id,
			licenseInternalProductId: licenseProduct.internal_id,
			granted: licenseDefinition.included,
		});
		const taken = await customerLicenseRepo.takeAssignment({
			db: txCtx.db,
			customerLicenseId: balance.id,
		});
		if (!taken) {
			throw new RecaseError({
				message: `No available licenses for ${planId}.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		return await provisionLicenseCustomerProduct({
			ctx: txCtx,
			fullCustomer,
			licenseProduct,
			licenseDefinition,
			internalEntityId: entity.internal_id,
			licenseParentCustomerProductId: parent.id,
		});
	});
};
